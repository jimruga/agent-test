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
}

const PRE_AUTH_PREFIX = 'preauth:'
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
}
