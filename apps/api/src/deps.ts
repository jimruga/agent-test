import type { OAuthProvider } from './auth/oauth-provider'
import type { Clock, SessionStore } from './auth/session-store'
import type { UserRepository } from './auth/user-repository'
import type { AppConfig } from './config/config'
import type { FeatureFlags } from './platform/feature-flags'

// The composition contract. buildApp depends only on these abstractions, so the
// full HTTP surface is testable in-process (app.inject) with in-memory fakes and
// no external services (Redis/Postgres/OAuth provider). index.ts wires the real
// implementations at the process edge.
export interface AppDeps {
  readonly config: AppConfig
  readonly flags: FeatureFlags
  readonly oauthProvider: OAuthProvider
  readonly sessionStore: SessionStore
  readonly userRepository: UserRepository
  readonly now?: Clock
}
