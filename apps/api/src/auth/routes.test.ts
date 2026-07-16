import { describe, expect, it } from 'vitest'
import { type TestApp, buildTestApp } from '../testing/build-test-app'

const SESSION = 'ttd_session'
const PRE_AUTH = 'ttd_session_preauth'

/** Drive login → return the pre-auth cookie value and the issued state. */
async function startLogin(t: TestApp, returnTo = '/app') {
  const res = await t.app.inject({
    method: 'GET',
    url: `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
  })
  const preAuth = res.cookies.find((c) => c.name === PRE_AUTH)
  const state = new URL(res.headers.location as string).searchParams.get('state')
  return { res, preAuthValue: preAuth?.value ?? '', state: state ?? '' }
}

/** Complete a full sign-in and return the session cookie value. */
async function signIn(t: TestApp): Promise<string> {
  const { preAuthValue, state } = await startLogin(t)
  const cb = await t.app.inject({
    method: 'GET',
    url: `/api/auth/callback?code=auth-code&state=${state}`,
    cookies: { [PRE_AUTH]: preAuthValue },
  })
  const session = cb.cookies.find((c) => c.name === SESSION && c.value)
  return session?.value ?? ''
}

describe('GET /api/auth/login', () => {
  it('redirects to the provider with S256 PKCE + state and sets an HttpOnly pre-auth cookie', async () => {
    const t = buildTestApp()
    const { res, preAuthValue } = await startLogin(t)
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('code_challenge=')
    expect(t.oauth.lastAuthorize?.codeChallenge).toBeTruthy()
    expect(preAuthValue).not.toBe('')
    const preAuthCookie = res.cookies.find((c) => c.name === PRE_AUTH)
    expect(preAuthCookie?.httpOnly).toBe(true)
  })

  it('rejects an unsupported provider with a 400 envelope', async () => {
    const t = buildTestApp()
    const res = await t.app.inject({ method: 'GET', url: '/api/auth/login?provider=evilcorp' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('bad_request')
  })

  it('bounds pre-auth records per IP — the 11th login in the window is rejected 429 (F8, Redis-fill defense)', async () => {
    const t = buildTestApp()
    // The bound is enforced through the session store (real RedisSessionStore over
    // InMemoryRedis), so this exercises the actual per-IP counter, not a stub.
    for (let i = 0; i < 10; i++) {
      const ok = await t.app.inject({ method: 'GET', url: '/api/auth/login' })
      expect(ok.statusCode).toBe(302)
    }
    const blocked = await t.app.inject({ method: 'GET', url: '/api/auth/login' })
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().error.code).toBe('rate_limited')
  })
})

describe('GET /api/auth/callback', () => {
  it('completes the happy path: session cookie set, redirect to returnTo, tokens never sent to client', async () => {
    const t = buildTestApp()
    const { preAuthValue, state } = await startLogin(t, '/app')
    const cb = await t.app.inject({
      method: 'GET',
      url: `/api/auth/callback?code=auth-code&state=${state}`,
      cookies: { [PRE_AUTH]: preAuthValue },
    })
    expect(cb.statusCode).toBe(302)
    expect(cb.headers.location).toBe('/app')
    const session = cb.cookies.find((c) => c.name === SESSION && c.value)
    expect(session?.httpOnly).toBe(true)
    // The response must NOT leak provider tokens anywhere.
    expect(cb.body).not.toContain('access-tok')
    expect(cb.body).not.toContain('refresh-tok')
  })

  it('400s on missing code or state', async () => {
    const t = buildTestApp()
    const res = await t.app.inject({ method: 'GET', url: '/api/auth/callback?code=only-code' })
    expect(res.statusCode).toBe(400)
  })

  it('400s when the pre-auth cookie is absent', async () => {
    const t = buildTestApp()
    const { state } = await startLogin(t)
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/auth/callback?code=c&state=${state}`,
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects a state mismatch (CSRF defense)', async () => {
    const t = buildTestApp()
    const { preAuthValue } = await startLogin(t)
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/auth/callback?code=c&state=attacker-supplied-state',
      cookies: { [PRE_AUTH]: preAuthValue },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.message).toContain('State')
  })

  it('rejects a nonce mismatch (replay defense)', async () => {
    const t = buildTestApp()
    t.oauth.overrideNonce = 'not-the-issued-nonce'
    const { preAuthValue, state } = await startLogin(t)
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/auth/callback?code=c&state=${state}`,
      cookies: { [PRE_AUTH]: preAuthValue },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.message).toContain('Nonce')
  })

  it('rejects an ID token with NO nonce claim (fail closed — replay defense, sec F1)', async () => {
    const t = buildTestApp()
    t.oauth.overrideNonce = null // provider omits the nonce entirely
    const { preAuthValue, state } = await startLogin(t)
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/auth/callback?code=c&state=${state}`,
      cookies: { [PRE_AUTH]: preAuthValue },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.message).toContain('Nonce')
  })

  it('400s when the token exchange fails', async () => {
    const t = buildTestApp()
    t.oauth.exchangeShouldFail = true
    const { preAuthValue, state } = await startLogin(t)
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/auth/callback?code=c&state=${state}`,
      cookies: { [PRE_AUTH]: preAuthValue },
    })
    expect(res.statusCode).toBe(400)
  })

  it('403s when the provider email is unverified', async () => {
    const t = buildTestApp()
    t.oauth.claims = { ...t.oauth.claims, emailVerified: false }
    const { preAuthValue, state } = await startLogin(t)
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/auth/callback?code=c&state=${state}`,
      cookies: { [PRE_AUTH]: preAuthValue },
    })
    expect(res.statusCode).toBe(403)
  })

  it('treats the pre-auth transaction as single-use (replayed callback fails)', async () => {
    const t = buildTestApp()
    const { preAuthValue, state } = await startLogin(t)
    const url = `/api/auth/callback?code=c&state=${state}`
    const first = await t.app.inject({ method: 'GET', url, cookies: { [PRE_AUTH]: preAuthValue } })
    expect(first.statusCode).toBe(302)
    const replay = await t.app.inject({ method: 'GET', url, cookies: { [PRE_AUTH]: preAuthValue } })
    expect(replay.statusCode).toBe(400)
  })
})

describe('GET /api/me', () => {
  it('401s without a session cookie', async () => {
    const t = buildTestApp()
    const res = await t.app.inject({ method: 'GET', url: '/api/me' })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('unauthenticated')
  })

  it('returns the current user after sign-in', async () => {
    const t = buildTestApp()
    const session = await signIn(t)
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/me',
      cookies: { [SESSION]: session },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.email).toBe('ada@example.com')
    expect(body.avatarInitials).toBe('AL')
    expect(body.memberships).toEqual([])
  })

  it('401s once the session passes its absolute expiry', async () => {
    const t = buildTestApp()
    const session = await signIn(t)
    t.advance(13 * 60 * 60 * 1000) // > 12h absolute cap
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/me',
      cookies: { [SESSION]: session },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  it('revokes the session + provider token and is idempotent', async () => {
    const t = buildTestApp()
    const session = await signIn(t)
    const out = await t.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { [SESSION]: session },
    })
    expect(out.statusCode).toBe(204)
    expect(t.oauth.revoked).toContain('refresh-tok')

    // Session no longer valid.
    const me = await t.app.inject({
      method: 'GET',
      url: '/api/me',
      cookies: { [SESSION]: session },
    })
    expect(me.statusCode).toBe(401)

    // Idempotent: logging out again with no session still 204s.
    const again = await t.app.inject({ method: 'POST', url: '/api/auth/logout' })
    expect(again.statusCode).toBe(204)
  })
})
