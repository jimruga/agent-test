// OAuth2 provider boundary (Adapter pattern, software-design-patterns skill).
// The routes depend on this interface, not on Google specifics — so the flow is
// testable with an in-memory fake and a second provider can be added later.
// Access/refresh tokens produced here are handed to the server-side session
// store ONLY; they are never serialized to the SPA (TDD §5).

export interface OAuthTokens {
  readonly accessToken: string
  readonly refreshToken?: string
  readonly idToken: string
  readonly expiresInSeconds: number
}

/** Verified ID-token claims. `nonce` is returned so the route can match it to the pre-auth value (replay defense). */
export interface OAuthClaims {
  readonly subject: string
  readonly email: string
  readonly emailVerified: boolean
  readonly name?: string
  readonly nonce?: string
}

export interface OAuthResult {
  readonly tokens: OAuthTokens
  readonly claims: OAuthClaims
}

export interface BuildAuthorizeUrlParams {
  readonly state: string
  readonly nonce: string
  readonly codeChallenge: string
}

export interface ExchangeCodeParams {
  readonly code: string
  readonly codeVerifier: string
}

export interface OAuthProvider {
  /** Build the provider authorize URL (exact-match redirect URI, S256 PKCE, state, nonce). */
  buildAuthorizeUrl(params: BuildAuthorizeUrlParams): string
  /** Exchange the auth code server-side and return tokens + verified claims. */
  exchangeCode(params: ExchangeCodeParams): Promise<OAuthResult>
  /** Best-effort revoke of the provider refresh token on logout / erasure. */
  revoke(refreshToken: string): Promise<void>
}

export interface GoogleProviderDeps {
  readonly authorizeUrl: string
  readonly tokenUrl: string
  readonly clientId: string
  readonly redirectUri: string
  readonly scopes: readonly string[]
  /** Resolve the client secret VALUE from its ARN at call time (never stored on this object). */
  readonly resolveClientSecret: () => Promise<string>
  /** Verify an ID token's signature + iss/aud/exp against the provider JWKS. */
  readonly verifyIdToken: (idToken: string) => Promise<OAuthClaims>
  readonly fetchImpl?: typeof fetch
}

/**
 * Google OIDC adapter. Structural implementation for the composition root; the
 * two security-critical injectables — `resolveClientSecret` (AWS Secrets Manager)
 * and `verifyIdToken` (JWKS signature + iss/aud/exp validation, OWASP A07/A08) —
 * are provided at wiring time. Until a real `verifyIdToken` is injected, tokens
 * cannot be accepted (it must throw), so an unverified ID token can never
 * establish a session. See impl-notes: JWKS verification is required before Gate 5.
 */
export function createGoogleProvider(deps: GoogleProviderDeps): OAuthProvider {
  const doFetch = deps.fetchImpl ?? fetch
  return {
    buildAuthorizeUrl({ state, nonce, codeChallenge }) {
      const url = new URL(deps.authorizeUrl)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', deps.clientId)
      url.searchParams.set('redirect_uri', deps.redirectUri)
      url.searchParams.set('scope', deps.scopes.join(' '))
      url.searchParams.set('state', state)
      url.searchParams.set('nonce', nonce)
      url.searchParams.set('code_challenge', codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      return url.toString()
    },
    async exchangeCode({ code, codeVerifier }) {
      const clientSecret = await deps.resolveClientSecret()
      const res = await doFetch(deps.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: codeVerifier,
          client_id: deps.clientId,
          client_secret: clientSecret,
          redirect_uri: deps.redirectUri,
        }),
      })
      if (!res.ok) throw new Error(`token exchange failed: ${res.status}`)
      const body = (await res.json()) as {
        access_token: string
        refresh_token?: string
        id_token: string
        expires_in: number
      }
      // Signature + claim verification is delegated to the injected verifier —
      // never trust an unverified JWT (OWASP A08).
      const claims = await deps.verifyIdToken(body.id_token)
      return {
        tokens: {
          accessToken: body.access_token,
          refreshToken: body.refresh_token,
          idToken: body.id_token,
          expiresInSeconds: body.expires_in,
        },
        claims,
      }
    },
    async revoke(refreshToken) {
      // Google token revocation endpoint; best-effort (logout must still succeed).
      await doFetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }),
      }).catch(() => undefined)
    },
  }
}
