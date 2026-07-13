import { describe, expect, it } from 'vitest'
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
