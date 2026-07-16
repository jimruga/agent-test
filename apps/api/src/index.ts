import Redis from 'ioredis'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import knexFactory from 'knex'
import { uuidv7 } from 'uuidv7'
import knexConfig from '../knexfile'
import { buildApp } from './app'
import { buildJwksVerifier } from './auth/jwks-verifier'
import { createGoogleProvider } from './auth/oauth-provider'
import { type RedisLike, RedisSessionStore } from './auth/session-store'
import { KnexUserRepository } from './auth/user-repository.knex'
import { loadConfig } from './config/config'
import type { AppDeps } from './deps'
import { flagsFromEnv } from './platform/feature-flags'
import { createDevResolver, unwiredSecretResolver } from './platform/secrets'
import { registerSecurityPlugins } from './platform/security'

// Google OIDC discovery constants (public). The JWKS is fetched + cached by jose's
// createRemoteJWKSet; jwtVerify checks the signature against it plus iss/aud/exp.
const GOOGLE_ISSUER = 'https://accounts.google.com'
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'

// ── Composition root ────────────────────────────────────────────────────────
// The ONLY place real implementations (Redis, Postgres, the OAuth provider, the
// JWKS verifier, the edge security plugins) are constructed. Everything below the
// app boundary depends on interfaces, so this file carries the wiring and the app
// carries the logic. Excluded from unit coverage; validated by typecheck + the
// integration/deploy lanes.
//
// ONE wiring point remains before a working deploy (tracked in impl-notes, flagged
// to devops):
//   - `secretResolver` — AWS Secrets Manager (devops IAM). Fails closed today.
// (F3 wired the real JWKS `verifyIdToken`; F8/F9 wired the edge security plugins.)

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
    async incr(key) {
      return redis.incr(key)
    },
  }
}

export function buildProdDeps(): AppDeps {
  const config = loadConfig()
  // Real ID-token verification (F3, OWASP A07/A08). The JWKS key set + jose's
  // jwtVerify are injected into the pure verifier; audience is this deployment's
  // OAuth client id. jose validates signature/iss/aud/exp; buildJwksVerifier adds
  // required-claim extraction and fails closed.
  const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL))
  const verifyIdToken = buildJwksVerifier({
    jwtVerify: async (token, keySet, options) => {
      const { payload } = await jwtVerify(token, keySet as Parameters<typeof jwtVerify>[1], options)
      return { payload }
    },
    keySet: googleJwks,
    issuer: GOOGLE_ISSUER,
    audience: config.oauth.clientId,
  })
  // NODE_ENV=development: read the OAuth client secret as a plain env var so
  // `make dev-up` login works without AWS Secrets Manager. Every other env keeps
  // the fail-closed resolver until devops wires real AWS Secrets Manager.
  const secretResolver =
    process.env.NODE_ENV === 'development'
      ? createDevResolver('OAUTH_CLIENT_SECRET')
      : unwiredSecretResolver
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
    registerSecurityPlugins,
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
