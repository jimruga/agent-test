// Server-side session + pre-auth store (TDD §5.2). Sessions and the short-lived
// login→callback ("pre-auth") transactions live here — NOT in the SPA. The cookie
// holds only the opaque session id; the OAuth tokens and PKCE material stay here.
//
// Design: the store logic lives once, over a minimal `RedisLike` seam. Production
// wires ioredis (ElastiCache); tests/dev wire InMemoryRedis. This keeps one tested
// code path and swaps only the backing client (dependency inversion).

export type Clock = () => number

export interface PreAuthData {
  readonly state: string
  readonly nonce: string
  readonly codeVerifier: string
  readonly returnTo: string
}

export interface SessionRecord {
  readonly id: string
  readonly userId: string
  readonly provider: string
  /** Provider tokens — server-side only, never returned to the client. */
  readonly accessToken: string
  readonly refreshToken?: string
  readonly createdAt: number
  /** Absolute expiry (hard cap), independent of the sliding idle TTL. */
  readonly absoluteExpiresAt: number
}

export interface SessionStore {
  putPreAuth(id: string, data: PreAuthData, ttlSeconds: number): Promise<void>
  /** Single-use fetch: returns and deletes the pre-auth transaction (replay-safe). */
  takePreAuth(id: string): Promise<PreAuthData | null>
  /**
   * Bound in-flight pre-auth record creation per client IP within a sliding window
   * (F8, Redis-fill defense). Increments the per-IP counter and returns whether
   * the attempt is within `maxPerWindow`. Every attempt re-arms the window TTL, so
   * the counter always carries a TTL and self-expires after `windowSeconds` of
   * inactivity (W1: no orphaned TTL-less key on a mid-call crash).
   */
  registerPreAuthAttempt(ip: string, maxPerWindow: number, windowSeconds: number): Promise<boolean>
  createSession(record: SessionRecord, idleTtlSeconds: number): Promise<void>
  getSession(id: string): Promise<SessionRecord | null>
  /** Sliding idle timeout — extend the session's TTL on activity. */
  touchSession(id: string, idleTtlSeconds: number): Promise<void>
  deleteSession(id: string): Promise<void>
}

export interface RedisLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  del(key: string): Promise<void>
  expire(key: string, ttlSeconds: number): Promise<void>
  /** Atomic increment (creates the key at 1 with NO expiry until `expire` is set). */
  incr(key: string): Promise<number>
}

const PRE_AUTH_PREFIX = 'preauth:'
const PRE_AUTH_COUNT_PREFIX = 'preauth-count:'
const SESSION_PREFIX = 'session:'

export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly redis: RedisLike,
    private readonly now: Clock = () => Date.now(),
  ) {}

  async putPreAuth(id: string, data: PreAuthData, ttlSeconds: number): Promise<void> {
    await this.redis.set(PRE_AUTH_PREFIX + id, JSON.stringify(data), ttlSeconds)
  }

  async takePreAuth(id: string): Promise<PreAuthData | null> {
    const key = PRE_AUTH_PREFIX + id
    const raw = await this.redis.get(key)
    if (!raw) return null
    await this.redis.del(key)
    return JSON.parse(raw) as PreAuthData
  }

  async registerPreAuthAttempt(
    ip: string,
    maxPerWindow: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const key = PRE_AUTH_COUNT_PREFIX + ip
    const count = await this.redis.incr(key)
    // W1 (atomicity): INCR creates a TTL-less key. Arming EXPIRE only on the first
    // increment leaves an orphaned, never-expiring key if the process dies between
    // the two calls (OOM/restart/deploy) — every later attempt from that IP then
    // increments a permanent counter and permanently locks the IP out of login.
    // Calling EXPIRE UNCONDITIONALLY after every INCR guarantees the key always
    // carries a TTL once this method returns, for any crash interleaving. This makes
    // the counter a sliding window (each attempt refreshes the window; it self-clears
    // only after `windowSeconds` of inactivity).
    // F8-FIXEDWINDOW-TRACK: like any windowed counter this admits up to ~2×
    // maxPerWindow across a window edge (a burst as one window ends plus a burst as
    // the next begins). Known, accepted trade-off — the edge @fastify/rate-limit is
    // the primary control and this per-IP bound is belt-and-braces (see routes.ts).
    await this.redis.expire(key, windowSeconds)
    return count <= maxPerWindow
  }

  async createSession(record: SessionRecord, idleTtlSeconds: number): Promise<void> {
    await this.redis.set(SESSION_PREFIX + record.id, JSON.stringify(record), idleTtlSeconds)
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const raw = await this.redis.get(SESSION_PREFIX + id)
    if (!raw) return null
    const record = JSON.parse(raw) as SessionRecord
    // Absolute cap wins even if the sliding idle TTL has not lapsed.
    if (record.absoluteExpiresAt <= this.now()) {
      await this.redis.del(SESSION_PREFIX + id)
      return null
    }
    return record
  }

  async touchSession(id: string, idleTtlSeconds: number): Promise<void> {
    await this.redis.expire(SESSION_PREFIX + id, idleTtlSeconds)
  }

  async deleteSession(id: string): Promise<void> {
    await this.redis.del(SESSION_PREFIX + id)
  }
}

/**
 * In-memory RedisLike for tests and local dev. Honors TTL against an injectable
 * clock so idle/absolute-expiry behavior can be tested deterministically. NOT for
 * production (single-process, non-durable).
 */
export class InMemoryRedis implements RedisLike {
  private readonly store = new Map<string, { value: string; expiresAt: number }>()
  constructor(private readonly now: Clock = () => Date.now()) {}

  private live(key: string): { value: string; expiresAt: number } | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key)
      return undefined
    }
    return entry
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null
  }
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 })
  }
  async del(key: string): Promise<void> {
    this.store.delete(key)
  }
  async expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.live(key)
    if (entry) entry.expiresAt = this.now() + ttlSeconds * 1000
  }
  async incr(key: string): Promise<number> {
    const entry = this.live(key)
    if (entry) {
      const next = Number(entry.value) + 1
      entry.value = String(next)
      return next
    }
    // New key: created at 1 with no expiry until `expire` arms it (matches Redis).
    this.store.set(key, { value: '1', expiresAt: Number.POSITIVE_INFINITY })
    return 1
  }
}
