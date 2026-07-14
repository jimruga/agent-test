// Secret resolution seam (secrets-management skill). A SecretResolver turns an
// ARN into its VALUE at runtime via the instance/execution IAM role — the value
// never lives in code, env literals, or logs. The production resolver (AWS
// Secrets Manager) is wired by devops with a least-privilege IAM policy.
//
// Until it is wired, the default FAILS CLOSED: it throws rather than returning a
// bogus/empty secret, so no code path can silently proceed without a real secret.
export type SecretResolver = (arn: string) => Promise<string>

export const unwiredSecretResolver: SecretResolver = async (arn) => {
  throw new Error(
    `SecretResolver not wired: cannot resolve ${arn}. Provide an AWS Secrets Manager resolver (least-privilege IAM) before deploy.`,
  )
}

// DEV-ONLY scaffolding. When NODE_ENV=development, `make dev-up` runs the stack
// in Rancher Desktop with no AWS Secrets Manager, so a login's token exchange
// cannot resolve an ARN. This resolver reads the secret as a PLAIN value from a
// named env var (e.g. OAUTH_CLIENT_SECRET) instead — the ARN argument is ignored.
// It is wired ONLY on the NODE_ENV=development path in index.ts; every other
// environment keeps the fail-closed AWS resolver above. It still fails closed if
// the var is unset (no bogus/empty secret). Never use this in staging/production.
export function createDevResolver(plainEnvVar: string): SecretResolver {
  return async () => {
    const val = process.env[plainEnvVar]
    if (!val) throw new Error(`[dev] env var ${plainEnvVar} is not set`)
    return val
  }
}
