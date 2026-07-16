import { beforeEach, describe, expect, it } from 'vitest'
import {
  InMemoryRedis,
  type RedisLike,
  RedisSessionStore,
  type SessionRecord,
} from './session-store'

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

  it('allows pre-auth attempts up to the per-IP max, then rejects (F8 Redis-fill bound)', async () => {
    const results: boolean[] = []
    for (let i = 0; i < 4; i++) {
      results.push(await store.registerPreAuthAttempt('203.0.113.7', 3, 600))
    }
    expect(results).toEqual([true, true, true, false])
  })

  it('resets the per-IP pre-auth counter once the window TTL lapses', async () => {
    expect(await store.registerPreAuthAttempt('203.0.113.7', 1, 600)).toBe(true)
    expect(await store.registerPreAuthAttempt('203.0.113.7', 1, 600)).toBe(false)
    clock += 601_000 // window elapsed
    expect(await store.registerPreAuthAttempt('203.0.113.7', 1, 600)).toBe(true)
  })

  it('counts each IP independently', async () => {
    expect(await store.registerPreAuthAttempt('198.51.100.1', 1, 600)).toBe(true)
    expect(await store.registerPreAuthAttempt('198.51.100.2', 1, 600)).toBe(true)
  })

  it('re-arms the window TTL on EVERY attempt, not just the first (W1: no orphaned TTL-less key)', async () => {
    // A spy over a real InMemoryRedis: the count reflects genuine state, and we
    // observe that expire fires on the second attempt (count > 1) too — the fix
    // for the incr/expire non-atomicity that could otherwise leave a key with no
    // TTL and permanently lock out the IP.
    const backing = new InMemoryRedis(now)
    const expireArgs: Array<[string, number]> = []
    const spy: RedisLike = {
      get: (k) => backing.get(k),
      set: (k, v, t) => backing.set(k, v, t),
      del: (k) => backing.del(k),
      incr: (k) => backing.incr(k),
      expire: (k, t) => {
        expireArgs.push([k, t])
        return backing.expire(k, t)
      },
    }
    const s = new RedisSessionStore(spy, now)
    await s.registerPreAuthAttempt('203.0.113.9', 5, 600) // count -> 1
    await s.registerPreAuthAttempt('203.0.113.9', 5, 600) // count -> 2
    expect(expireArgs).toEqual([
      ['preauth-count:203.0.113.9', 600],
      ['preauth-count:203.0.113.9', 600],
    ])
  })
})
