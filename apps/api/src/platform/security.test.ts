import { describe, expect, it } from 'vitest'
import { buildTestApp } from '../testing/build-test-app'
import { registerSecurityPlugins } from './security'

// F8/F9 opt-in suite. This is the ONLY test file that wires the real edge plugins
// (@fastify/helmet, @fastify/rate-limit) — every other test leaves them out, so
// the bulk of the suite needs neither package. Headers/limiter behaviour can only
// be verified with the real plugins running.

function securedApp() {
  return buildTestApp({ registerSecurityPlugins })
}

describe('F9 — security headers (@fastify/helmet)', () => {
  it('sets X-Frame-Options: DENY on /ping', async () => {
    const t = securedApp()
    const res = await t.app.inject({ method: 'GET', url: '/ping' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-frame-options']).toBe('DENY')
  })

  it('sets X-Content-Type-Options: nosniff on /ping', async () => {
    const t = securedApp()
    const res = await t.app.inject({ method: 'GET', url: '/ping' })
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('sets Referrer-Policy: no-referrer on /ping', async () => {
    const t = securedApp()
    const res = await t.app.inject({ method: 'GET', url: '/ping' })
    expect(res.headers['referrer-policy']).toBe('no-referrer')
  })

  it('emits ONLY the two declared CSP directives (useDefaults:false — W2)', async () => {
    const t = securedApp()
    const res = await t.app.inject({ method: 'GET', url: '/ping' })
    // Exact match proves helmet did not merge its own defaults (e.g. script-src
    // 'self'), which would have widened default-src 'none'.
    expect(res.headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'")
    // Belt-and-braces, independent of helmet's directive-join separator: assert no
    // default directive leaked in regardless of how directives are concatenated.
    expect(res.headers['content-security-policy']).not.toContain('script-src')
    expect(res.headers['content-security-policy']).not.toContain('style-src')
    expect(res.headers['content-security-policy']).not.toContain('img-src')
  })
})

describe('F8 — rate limiting (@fastify/rate-limit)', () => {
  it('returns 429 in the error envelope once the auth-group limit is exceeded', async () => {
    const t = securedApp()
    // /auth/logout carries the auth-group rate-limit config (max 100) and has no
    // per-IP pre-auth bound, so it isolates the edge limiter cleanly.
    let last = await t.app.inject({ method: 'POST', url: '/api/auth/logout' })
    for (let i = 0; i < 100; i++) {
      last = await t.app.inject({ method: 'POST', url: '/api/auth/logout' })
    }
    expect(last.statusCode).toBe(429)
    expect(last.json().error.code).toBe('rate_limited')
  })

  it('does NOT rate-limit /ping (outside the /api/auth group)', async () => {
    const t = securedApp()
    for (let i = 0; i < 150; i++) {
      const res = await t.app.inject({ method: 'GET', url: '/ping' })
      expect(res.statusCode).toBe(200)
    }
  })
})
