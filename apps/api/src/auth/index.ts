// Auth feature barrel — the only entry point other modules import from.
export { registerAuthRoutes } from './routes'
export { createGoogleProvider } from './oauth-provider'
export type { OAuthProvider, OAuthResult, OAuthClaims, OAuthTokens } from './oauth-provider'
export {
  RedisSessionStore,
  InMemoryRedis,
  type SessionStore,
  type SessionRecord,
  type RedisLike,
  type Clock,
} from './session-store'
export { InMemoryUserRepository, deriveInitials, type UserRepository } from './user-repository'
export { KnexUserRepository } from './user-repository.knex'
