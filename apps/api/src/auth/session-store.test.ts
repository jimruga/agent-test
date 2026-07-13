import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryRedis, RedisSessionStore, type SessionRecord } from './session-store'

describe('RedisSessionStore over InMemoryRedis', () => {
  let clock: number
  const now = () => clock
  let store: RedisSessionStore

  beforeEach(() => {
    clock = 1_000_000
    store = new RedisSessionStore(new InMemoryRedis(now), now)
  })

  const record = (): SessionRecord => ({
    id: 'sess-1',
    userId: 'user-1',
    provider: 'google',
    accessToken: 'at',
    refreshToken: 'rt',
    createdAt: clock,
    absoluteExpiresAt: clock + 60_000,
  })

  it('pre-auth is single-use: the second take returns null', async () => {
    await store.putPreAuth(
      'pa-1',
      { state: 's', nonce: 'n', codeVerifier: 'v', returnTo: '/' },
      600,
    )
    const first = await store.takePreAuth('pa-1')
    expect(first?.state).toBe('s')
    expect(await store.takePreAuth('pa-1')).toBeNull()
  })

  it('stores and retrieves a session without exposing it beyond the store', async () => {
    await store.createSession(record(), 30)
    const got = await store.getSession('sess-1')
    expect(got?.userId).toBe('user-1')
    expect(got?.accessToken).toBe('at')
  })

  it('enforces the absolute expiry even if idle TTL has not lapsed', async () => {
    await store.createSession(record(), 3600) // long idle TTL
    clock += 61_000 // past absoluteExpiresAt
    expect(await store.getSession('sess-1')).toBeNull()
  })

  it('expires an idle session once its sliding TTL lapses', async () => {
    await store.createSession(record(), 30)
    clock += 31_000
    expect(await store.getSession('sess-1')).toBeNull()
  })

  it('touch extends the idle TTL', async () => {
    await store.createSession(record(), 30)
    clock += 20_000
    await store.touchSession('sess-1', 30)
    clock += 20_000 // 40s since creation, but only 20s since touch
    expect(await store.getSession('sess-1')).not.toBeNull()
  })

  it('delete removes the session (logout)', async () => {
    await store.createSession(record(), 30)
    await store.deleteSession('sess-1')
    expect(await store.getSession('sess-1')).toBeNull()
  })
})
