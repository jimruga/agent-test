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
