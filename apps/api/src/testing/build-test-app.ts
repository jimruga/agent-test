import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app'
import type {
  BuildAuthorizeUrlParams,
  ExchangeCodeParams,
  OAuthClaims,
  OAuthProvider,
  OAuthResult,
} from '../auth/oauth-provider'
import { InMemoryRedis, RedisSessionStore } from '../auth/session-store'
import { InMemoryUserRepository } from '../auth/user-repository'
import { loadConfig } from '../config/config'
import type { AppDeps } from '../deps'
import { StaticFeatureFlags } from '../platform/feature-flags'

// Test double for the OAuth provider. Simulates correct provider behavior by
// default (echoes the issued nonce back in the verified claims); knobs let tests
// force failure or a nonce mismatch. No network, no real crypto.
export class FakeOAuthProvider implements OAuthProvider {
  lastAuthorize?: BuildAuthorizeUrlParams
  revoked: string[] = []
  exchangeShouldFail = false
  /** When set (incl. null), used instead of echoing the issued nonce. */
  overrideNonce?: string | null
  claims: Omit<OAuthClaims, 'nonce'> = {
    subject: 'google-sub-123',
    email: 'ada@example.com',
    emailVerified: true,
    name: 'Ada Lovelace',
  }

  buildAuthorizeUrl(params: BuildAuthorizeUrlParams): string {
    this.lastAuthorize = params
    return `https://provider.test/authorize?state=${params.state}&code_challenge=${params.codeChallenge}`
  }

  async exchangeCode(_params: ExchangeCodeParams): Promise<OAuthResult> {
    if (this.exchangeShouldFail) throw new Error('exchange failed')
    const nonce = this.overrideNonce !== undefined ? this.overrideNonce ?? undefined : this.lastAuthorize?.nonce
    return {
      tokens: { accessToken: 'access-tok', refreshToken: 'refresh-tok', idToken: 'id-tok', expiresInSeconds: 3600 },
      claims: { ...this.claims, nonce },
    }
  }

  async revoke(refreshToken: string): Promise<void> {
    this.revoked.push(refreshToken)
  }
}

const TEST_ENV: NodeJS.ProcessEnv = {
  OAUTH_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  OAUTH_REDIRECT_URI: 'https://app.test/api/auth/callback',
  OAUTH_CLIENT_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:000000000000:secret:oauth-test',
  SESSION_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:000000000000:secret:session-test',
  RETURN_TO_ALLOWLIST: '/,/app',
  SESSION_COOKIE_SECURE: 'false',
}

export interface TestApp {
  app: FastifyInstance
  deps: AppDeps
  oauth: FakeOAuthProvider
  userRepository: InMemoryUserRepository
  advance(ms: number): void
}

export function buildTestApp(options: { flagsOn?: string[] } = {}): TestApp {
  let clock = 1_700_000_000_000
  const now = () => clock
  const oauth = new FakeOAuthProvider()
  const sessionStore = new RedisSessionStore(new InMemoryRedis(now), now)
  let idSeq = 0
  const userRepository = new InMemoryUserRepository(() => `user-${++idSeq}`)
  const deps: AppDeps = {
    config: loadConfig(TEST_ENV),
    flags: new StaticFeatureFlags(options.flagsOn ?? []),
    oauthProvider: oauth,
    sessionStore,
    userRepository,
    now,
  }
  return { app: buildApp(deps), deps, oauth, userRepository, advance: (ms: number) => { clock += ms } }
}
