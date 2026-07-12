import Redis from 'ioredis'
import knexFactory from 'knex'
import { uuidv7 } from 'uuidv7'
import knexConfig from '../knexfile'
import { buildApp } from './app'
import { createGoogleProvider } from './auth/oauth-provider'
import type { OAuthClaims } from './auth/oauth-provider'
import { type RedisLike, RedisSessionStore } from './auth/session-store'
import { KnexUserRepository } from './auth/user-repository.knex'
import { loadConfig } from './config/config'
import type { AppDeps } from './deps'
import { flagsFromEnv } from './platform/feature-flags'
import { unwiredSecretResolver } from './platform/secrets'

// ── Composition root ────────────────────────────────────────────────────────
// The ONLY place real implementations (Redis, Postgres, the OAuth provider) are
// constructed. Everything below the app boundary depends on interfaces, so this
// file carries the wiring and the app carries the logic. Excluded from unit
// coverage; validated by typecheck + the integration/deploy lanes.
//
// TWO wiring points remain before a working deploy (tracked in impl-notes,
// flagged to security + devops):
//   1. `verifyIdToken` — JWKS signature + iss/aud/exp validation (security).
//   2. `secretResolver` — AWS Secrets Manager (devops IAM). Fails closed today.

function ioredisAdapter(redis: Redis): RedisLike {
  return {
    async get(key) {
      return redis.get(key)
    },
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, 'EX', ttlSeconds)
    },
    async del(key) {
      await redis.del(key)
    },
    async expire(key, ttlSeconds) {
      await redis.expire(key, ttlSeconds)
    },
  }
}

// PLACEHOLDER — MUST be replaced with real JWKS-based verification (e.g. `jose`
// createRemoteJWKSet + jwtVerify against the provider's issuer) before production.
// Fails closed so an unverified token can never establish a session (OWASP A08).
const verifyIdToken = async (_idToken: string): Promise<OAuthClaims> => {
  throw new Error(
    'verifyIdToken not wired: implement JWKS signature + iss/aud/exp verification before deploy',
  )
}

export function buildProdDeps(): AppDeps {
  const config = loadConfig()
  const secretResolver = unwiredSecretResolver // devops wires AWS Secrets Manager
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')
  const knex = knexFactory(
    knexConfig[process.env.NODE_ENV === 'production' ? 'production' : 'development'],
  )
  return {
    config,
    flags: flagsFromEnv(),
    oauthProvider: createGoogleProvider({
      authorizeUrl: config.oauth.authorizeUrl,
      tokenUrl: config.oauth.tokenUrl,
      clientId: config.oauth.clientId,
      redirectUri: config.oauth.redirectUri,
      scopes: config.oauth.scopes,
      resolveClientSecret: () => secretResolver(config.oauth.clientSecretArn),
      verifyIdToken,
    }),
    sessionStore: new RedisSessionStore(ioredisAdapter(redis)),
    userRepository: new KnexUserRepository(knex, uuidv7),
  }
}

async function main(): Promise<void> {
  const deps = buildProdDeps()
  const app = buildApp(deps)
  await app.listen({ port: deps.config.port, host: '0.0.0.0' })
}

// Only run when executed directly (not when imported by a test).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
