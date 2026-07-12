import type { FastifyInstance } from 'fastify'
import { safeReturnTo } from '../config/config'
import { sendError } from '../platform/error-envelope'
import type { AppDeps } from '../deps'
import { clearCookie, parseCookies, serializeSessionCookie } from './cookies'
import {
  codeChallengeS256,
  generateCodeVerifier,
  generateNonce,
  generatePreAuthId,
  generateSessionId,
  generateState,
  timingSafeStrEqual,
} from './pkce'

const PRE_AUTH_TTL_SECONDS = 600 // 10 minutes to complete the login round-trip.

/**
 * OAuth2 authorization-code + PKCE routes. All token handling is server-side
 * (TDD §5): the browser only ever receives an opaque session cookie. These
 * routes register independently of the team_todo_mvp flag (TDD §7) so a canary
 * cohort can be admitted; the flag gates the feature routes, not sign-in.
 */
export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { config, oauthProvider, sessionStore, userRepository } = deps
  const now = deps.now ?? (() => Date.now())
  const preAuthCookieName = `${config.cookie.name}_preauth`

  const sessionCookieFlags = {
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    maxAgeSeconds: config.cookie.idleTtlSeconds,
  }

  // GET /api/auth/login — start the flow.
  app.get<{ Querystring: { provider?: string; returnTo?: string } }>('/auth/login', async (req, reply) => {
    const provider = req.query.provider ?? config.oauth.provider
    if (provider !== config.oauth.provider) {
      return sendError(reply, 'bad_request', 'Unsupported identity provider')
    }
    const state = generateState()
    const nonce = generateNonce()
    const codeVerifier = generateCodeVerifier()
    const returnTo = safeReturnTo(req.query.returnTo, config.returnToAllowlist)
    const preAuthId = generatePreAuthId()

    await sessionStore.putPreAuth(preAuthId, { state, nonce, codeVerifier, returnTo }, PRE_AUTH_TTL_SECONDS)

    reply.header(
      'set-cookie',
      serializeSessionCookie(preAuthCookieName, preAuthId, {
        secure: config.cookie.secure,
        sameSite: config.cookie.sameSite,
        maxAgeSeconds: PRE_AUTH_TTL_SECONDS,
      }),
    )
    const authorizeUrl = oauthProvider.buildAuthorizeUrl({
      state,
      nonce,
      codeChallenge: codeChallengeS256(codeVerifier),
    })
    return reply.redirect(authorizeUrl, 302)
  })

  // GET /api/auth/callback — provider redirect target; exchange code server-side.
  app.get<{ Querystring: { code?: string; state?: string } }>('/auth/callback', async (req, reply) => {
    const { code, state } = req.query
    if (!code || !state) {
      return sendError(reply, 'bad_request', 'Missing code or state')
    }
    const cookies = parseCookies(req.headers.cookie)
    const preAuthId = cookies[preAuthCookieName]
    if (!preAuthId) {
      return sendError(reply, 'bad_request', 'Missing pre-auth context')
    }
    const preAuth = await sessionStore.takePreAuth(preAuthId) // single-use
    if (!preAuth) {
      return sendError(reply, 'bad_request', 'Expired or unknown pre-auth context')
    }
    // CSRF: the state returned by the provider must match the one we issued
    // (constant-time compare — the incoming value is attacker-influenced).
    if (!timingSafeStrEqual(preAuth.state, state)) {
      return sendError(reply, 'bad_request', 'State mismatch')
    }

    let result: Awaited<ReturnType<typeof oauthProvider.exchangeCode>>
    try {
      result = await oauthProvider.exchangeCode({ code, codeVerifier: preAuth.codeVerifier })
    } catch {
      return sendError(reply, 'bad_request', 'Authorization exchange failed')
    }
    // Replay: the nonce embedded in the (verified) ID token MUST be present AND
    // match the one we issued. We always send a `nonce` on the authorize request,
    // so per OIDC the ID token must echo it — an absent/undefined nonce is a
    // rejection (fail closed), never a skipped check (sec F1 / review W3, OWASP
    // A07). Ideally the JWKS verifier also binds the nonce; see impl-notes.
    if (result.claims.nonce === undefined || !timingSafeStrEqual(result.claims.nonce, preAuth.nonce)) {
      return sendError(reply, 'bad_request', 'Nonce mismatch')
    }
    if (!result.claims.emailVerified) {
      return sendError(reply, 'forbidden', 'Email not verified with the provider')
    }

    const { user } = await userRepository.findOrCreateFromOAuth({
      provider: config.oauth.provider,
      subject: result.claims.subject,
      email: result.claims.email,
      displayName: result.claims.name ?? result.claims.email,
    })

    const sessionId = generateSessionId()
    const startedAt = now()
    await sessionStore.createSession(
      {
        id: sessionId,
        userId: user.id,
        provider: config.oauth.provider,
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        createdAt: startedAt,
        absoluteExpiresAt: startedAt + config.cookie.absoluteTtlSeconds * 1000,
      },
      config.cookie.idleTtlSeconds,
    )

    reply.header('set-cookie', [
      serializeSessionCookie(config.cookie.name, sessionId, sessionCookieFlags),
      // Retire the pre-auth cookie now the transaction is consumed.
      clearCookie(preAuthCookieName, { secure: config.cookie.secure, sameSite: config.cookie.sameSite }),
    ])
    return reply.redirect(preAuth.returnTo, 302)
  })

  // POST /api/auth/logout — revoke session + provider token; idempotent.
  app.post('/auth/logout', async (req, reply) => {
    const sessionId = parseCookies(req.headers.cookie)[config.cookie.name]
    if (sessionId) {
      const session = await sessionStore.getSession(sessionId)
      if (session?.refreshToken) {
        await oauthProvider.revoke(session.refreshToken).catch(() => undefined)
      }
      await sessionStore.deleteSession(sessionId)
    }
    reply.header(
      'set-cookie',
      clearCookie(config.cookie.name, { secure: config.cookie.secure, sameSite: config.cookie.sameSite }),
    )
    return reply.code(204).send()
  })

  // GET /api/me — current user; 401 without a valid session.
  app.get('/me', async (req, reply) => {
    const sessionId = parseCookies(req.headers.cookie)[config.cookie.name]
    if (!sessionId) return sendError(reply, 'unauthenticated', 'Not signed in')
    const session = await sessionStore.getSession(sessionId)
    if (!session) return sendError(reply, 'unauthenticated', 'Session expired')

    const me = await userRepository.getWithMemberships(session.userId)
    if (!me) {
      // User was erased (TDD §6.3) but a stale session remained — fail closed.
      await sessionStore.deleteSession(sessionId)
      return sendError(reply, 'unauthenticated', 'Session no longer valid')
    }
    await sessionStore.touchSession(sessionId, config.cookie.idleTtlSeconds) // sliding idle
    return reply.code(200).send(me)
  })
}
