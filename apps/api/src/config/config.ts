// Runtime configuration. RULE: secrets are referenced by ARN and resolved at
// runtime via the instance/execution IAM role (secrets-management skill). The
// OAuth *client secret* and the session signing pepper are ARNs here — their
// VALUES never appear in code, env literals committed to git, logs, or config.
// The OAuth client_id and provider URLs are public and are plain config.

export interface OAuthConfig {
  readonly provider: 'google'
  readonly authorizeUrl: string
  readonly tokenUrl: string
  readonly clientId: string
  readonly redirectUri: string
  readonly scopes: readonly string[]
  /** AWS Secrets Manager ARN for the client secret — a reference, not the value. */
  readonly clientSecretArn: string
}

export interface SessionCookieConfig {
  readonly name: string
  readonly secure: boolean
  readonly sameSite: 'Lax' | 'Strict' | 'None'
  readonly idleTtlSeconds: number
  readonly absoluteTtlSeconds: number
}

export interface AppConfig {
  readonly port: number
  readonly oauth: OAuthConfig
  /** ARN of the session signing/pepper secret — reference only. */
  readonly sessionSecretArn: string
  readonly cookie: SessionCookieConfig
  /** Same-origin paths permitted as post-login redirect targets (open-redirect guard). */
  readonly returnToAllowlist: readonly string[]
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key]
  if (!v) throw new Error(`Missing required env var: ${key}`)
  return v
}

function looksLikeSecretValue(key: string, value: string): boolean {
  // Defense against the classic mistake of putting a secret value where an ARN
  // reference belongs. Real AWS secret ARNs start with `arn:aws:`.
  return key.endsWith('_ARN') && value.length > 0 && !value.startsWith('arn:aws:')
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  for (const key of ['OAUTH_CLIENT_SECRET_ARN', 'SESSION_SECRET_ARN']) {
    const v = env[key]
    if (v && looksLikeSecretValue(key, v)) {
      throw new Error(
        `${key} must be an AWS ARN reference (arn:aws:...), not a literal secret value`,
      )
    }
  }

  return {
    port: Number(env.PORT ?? 3001),
    oauth: {
      provider: 'google',
      authorizeUrl: env.OAUTH_AUTHORIZE_URL ?? 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: env.OAUTH_TOKEN_URL ?? 'https://oauth2.googleapis.com/token',
      clientId: required(env, 'OAUTH_CLIENT_ID'),
      redirectUri: required(env, 'OAUTH_REDIRECT_URI'),
      scopes: (env.OAUTH_SCOPES ?? 'openid email profile').split(' ').filter(Boolean),
      clientSecretArn: required(env, 'OAUTH_CLIENT_SECRET_ARN'),
    },
    sessionSecretArn: required(env, 'SESSION_SECRET_ARN'),
    cookie: {
      name: env.SESSION_COOKIE_NAME ?? 'ttd_session',
      secure: env.SESSION_COOKIE_SECURE !== 'false',
      sameSite: 'Lax',
      idleTtlSeconds: Number(env.SESSION_IDLE_TTL_SECONDS ?? 60 * 60 * 2),
      absoluteTtlSeconds: Number(env.SESSION_ABSOLUTE_TTL_SECONDS ?? 60 * 60 * 12),
    },
    returnToAllowlist: (env.RETURN_TO_ALLOWLIST ?? '/')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  }
}

/**
 * Resolve an untrusted `returnTo` to a safe same-origin path, defending against
 * open redirect (OWASP A01/A10). Only accepts an allowlisted relative path that
 * starts with a single '/'. Protocol-relative ('//host'), backslash tricks, and
 * absolute URLs are rejected — falling back to the first allowlisted default.
 */
export function safeReturnTo(returnTo: string | undefined, allowlist: readonly string[]): string {
  const fallback = allowlist[0] ?? '/'
  if (!returnTo) return fallback
  if (!returnTo.startsWith('/')) return fallback
  if (returnTo.startsWith('//')) return fallback
  if (returnTo.includes('\\')) return fallback
  const path = returnTo.split('?')[0]?.split('#')[0] ?? ''
  const ok = allowlist.some(
    (allowed) => path === allowed || path.startsWith(`${allowed.replace(/\/$/, '')}/`),
  )
  return ok ? returnTo : fallback
}
