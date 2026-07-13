# Infrastructure — Team To-Do App (CloudFormation)

All infra is code. **No console changes** (no drift). Stacks are parameterized by
`Environment` (`staging` | `production`) and deployed in order. Secrets are
referenced by ARN / dynamic resolution — **never literals** (secrets-management skill).

## Stack order (dependencies flow downward via cross-stack exports)

| # | Template | Provisions | Depends on |
|---|----------|------------|------------|
| 10 | `10-network.yaml` | VPC, public/private-app/private-data subnets (2 AZ), IGW, NAT, route tables, **interface VPC endpoints** (Secrets Manager, KMS, CloudWatch Logs, SSM) + S3 gateway endpoint, security groups (alb/app/db/redis) | — |
| 20 | `20-data.yaml` | **KMS CMK** (rotation on), **RDS Postgres** (encrypted, private, Multi-AZ prod, PITR), **ElastiCache Redis** (TLS + at-rest KMS, private), **Secrets Manager** secrets (OAuth client secret, session pepper, `app_runtime`/`app_migrator` DB creds, Redis auth token) | 10 |
| 30 | `30-compute.yaml` | ALB (HTTPS + HTTP→HTTPS redirect), ACM cert ref, target group (`/ping` health check), Launch Template (Node 26 AMI), ASG (Multi-AZ prod), **least-privilege instance IAM role** | 10, 20 |
| 40 | `40-edge-waf.yaml` | **WAFv2** regional WebACL (AWS managed rule groups + **rate-based rule scoped to `/api/auth/*`**), ALB association. Shield Standard is always-on | 30 |

## Security-review must-wire coverage (F3–F9)

| Finding | Where wired |
|---------|-------------|
| F3 JWKS verify | App code (software-engineer) + JWKS is a **public** provider URL (no secret); no infra secret needed. Egress allowlist to `accounts.google.com`/`www.googleapis.com` documented in `30-compute.yaml` SG/endpoint notes |
| F4 Secrets Manager least-privilege IAM | `30-compute.yaml` `AppInstanceRole` — `secretsmanager:GetSecretValue` on **enumerated ARNs only** + `kms:Decrypt` on the one CMK |
| F5 Redis private + TLS + KMS | `20-data.yaml` `RedisReplicationGroup` (`TransitEncryptionEnabled`, `AtRestEncryptionEnabled`, `KmsKeyId`), `10-network.yaml` `RedisSecurityGroup` (from app-sg only) |
| F6 RDS KMS at rest + inbound restricted | `20-data.yaml` `Database` (`StorageEncrypted`, `KmsKeyId`), `10-network.yaml` `DbSecurityGroup` (5432 from app-sg only) |
| F7 `app_runtime` / `app_migrator` role split | `20-data.yaml` secrets + `bootstrap-db-roles.sql` (run once by migration runner as master) |
| F8 Rate limiting on `/api/auth/*` | `40-edge-waf.yaml` rate-based rule (edge) + `@fastify/rate-limit` (app seam, software-engineer) |
| F9 Security headers | `@fastify/helmet` (app) — HSTS/CSP/X-Frame-Options/nosniff/Referrer-Policy |

See `workspace/deploy-plan-s0-s1.md` for the full Gate 6 plan, rollout, and rollback runbook.
