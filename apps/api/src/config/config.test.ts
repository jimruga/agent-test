import { describe, expect, it } from 'vitest'
import { loadConfig, safeReturnTo } from './config'

const baseEnv = {
  OAUTH_CLIENT_ID: 'client-123.apps.googleusercontent.com',
  OAUTH_REDIRECT_URI: 'https://app.example.com/api/auth/callback',
  OAUTH_CLIENT_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:111122223333:secret:oauth-abc',
  SESSION_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:111122223333:secret:session-def',
} satisfies NodeJS.ProcessEnv

describe('loadConfig', () => {
  it('loads config and keeps secrets as ARN references (never values)', () => {
    const cfg = loadConfig(baseEnv)
    expect(cfg.oauth.clientSecretArn.startsWith('arn:aws:')).toBe(true)
    expect(cfg.sessionSecretArn.startsWith('arn:aws:')).toBe(true)
    expect(cfg.cookie.secure).toBe(true)
    expect(cfg.cookie.sameSite).toBe('Lax')
  })

  it('rejects a literal secret value where an ARN reference is required', () => {
    expect(() =>
      loadConfig({ ...baseEnv, OAUTH_CLIENT_SECRET_ARN: 'super-secret-literal' }),
    ).toThrow(/must be an AWS ARN reference/)
  })

  it('throws when a required var is missing', () => {
    const { OAUTH_CLIENT_ID: _omit, ...rest } = baseEnv
    expect(() => loadConfig(rest)).toThrow(/OAUTH_CLIENT_ID/)
  })

  it('relaxes the ARN-shape check under NODE_ENV=development (plain vars carry the secret)', () => {
    const cfg = loadConfig({
      ...baseEnv,
      NODE_ENV: 'development',
      OAUTH_CLIENT_SECRET_ARN: 'local-dev-oauth',
      SESSION_SECRET_ARN: 'local-dev-session',
    })
    expect(cfg.oauth.clientSecretArn).toBe('local-dev-oauth')
    expect(cfg.sessionSecretArn).toBe('local-dev-session')
  })

  it('still enforces the ARN-shape check outside development (fails closed)', () => {
    expect(() =>
      loadConfig({ ...baseEnv, NODE_ENV: 'production', OAUTH_CLIENT_SECRET_ARN: 'not-an-arn' }),
    ).toThrow(/must be an AWS ARN reference/)
  })
})

describe('safeReturnTo (open-redirect guard)', () => {
  const allow = ['/app', '/dashboard'] // restrictive: no root entry
  it('allows an allowlisted path prefix and an exact match', () => {
    expect(safeReturnTo('/app/teams', allow)).toBe('/app/teams')
    expect(safeReturnTo('/dashboard', allow)).toBe('/dashboard')
  })
  it('rejects absolute URLs, protocol-relative, and backslash tricks (→ fallback)', () => {
    expect(safeReturnTo('https://evil.example.com', allow)).toBe('/app')
    expect(safeReturnTo('//evil.example.com', allow)).toBe('/app')
    expect(safeReturnTo('/\\evil', allow)).toBe('/app')
  })
  it('rejects a relative path outside the allowlist (→ first allowlisted default)', () => {
    expect(safeReturnTo('/admin', allow)).toBe('/app')
  })
  it('a root ("/") allowlist entry permits any same-origin relative path', () => {
    expect(safeReturnTo('/anything/here', ['/'])).toBe('/anything/here')
  })
  it('falls back to the default when returnTo is absent', () => {
    expect(safeReturnTo(undefined, allow)).toBe('/app')
  })
})
