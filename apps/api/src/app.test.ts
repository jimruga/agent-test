import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from './app'
import { buildTestApp } from './testing/build-test-app'

describe('app baseline', () => {
  it('serves the operational /ping probe (not under /api, not in the contract)', async () => {
    const { app } = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/ping' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })

  it('returns the error envelope for an unknown route', async () => {
    const { app } = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: { code: 'not_found', message: 'Resource not found' } })
  })
})

describe('trustProxy resolves the real client IP (F8-IP)', () => {
  afterEach(() => {
    // vi.unstubAllEnvs() is the correct way to restore process.env between tests:
    // assigning `undefined` or a saved undefined value would set the string
    // "undefined", contaminating every subsequent test that reads the env var.
    vi.unstubAllEnvs()
  })

  it('resolves req.ip from X-Forwarded-For (default: trust one proxy hop)', async () => {
    // Both F8 rate-limiting controls key on req.ip. Without trustProxy, req.ip is
    // the immediate TCP peer (the ALB in prod) and the limits become one shared
    // global counter. With trustProxy=1 (the default here — TRUSTED_PROXY_CIDR is
    // unset) Fastify trusts one hop and resolves the XFF client IP.
    vi.stubEnv('TRUSTED_PROXY_CIDR', '')
    const { app } = buildTestApp()
    let seenIp: string | undefined
    app.addHook('onRequest', async (req) => {
      seenIp = req.ip
    })
    const res = await app.inject({
      method: 'GET',
      url: '/ping',
      headers: { 'x-forwarded-for': '1.2.3.4' },
    })
    expect(res.statusCode).toBe(200)
    expect(seenIp).toBe('1.2.3.4')
  })

  it('clamps TRUSTED_PROXY_CIDR=0 to 1 so per-IP rate limiting is never silently broken', async () => {
    // proxy-addr interprets trustProxy: 0 as "trust zero hops" — req.ip becomes the
    // socket IP (the ALB), collapsing both F8 controls to a single global counter.
    // resolveTrustProxy() must clamp parsed integers to >= 1 before passing them to
    // Fastify. We verify via the observable effect: req.ip resolves from XFF.
    vi.stubEnv('TRUSTED_PROXY_CIDR', '0')
    const { deps } = buildTestApp()
    const app = buildApp(deps)
    let seenIp: string | undefined
    app.addHook('onRequest', async (req) => {
      seenIp = req.ip
    })
    await app.inject({
      method: 'GET',
      url: '/ping',
      headers: { 'x-forwarded-for': '5.6.7.8' },
    })
    expect(seenIp).toBe('5.6.7.8')
  })
})

describe('feature flag gates the feature routes (S0.3)', () => {
  it('is dark (404) when team_todo_mvp is off', async () => {
    const { app } = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/teams' })
    expect(res.statusCode).toBe(404)
  })

  it('is live when team_todo_mvp is on', async () => {
    const { app } = buildTestApp({ flagsOn: ['team_todo_mvp'] })
    const res = await app.inject({ method: 'GET', url: '/api/teams' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ items: [] })
  })
})
