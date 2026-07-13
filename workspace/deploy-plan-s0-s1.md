# Deployment Plan & Rollback Runbook — S0/S1 (Team To-Do App MVP)

- **Gate:** 6 (Infra Plan Review) — **STOP for human approval before any deploy.**
- **Author:** devops-engineer · **Date:** 2026-07-13
- **Scope:** S0 (paved-road bootstrap) + S1 (OAuth2 auth slice: login/callback/me/logout,
  opaque session cookie, Redis session store, feature-flag seam) on branch
  `feature/s0-s1-foundation-auth` @ SHA `a994e49b1e9f2a83ab6609b61c88e1f99e9a546c`.
- **Risk tier:** REGULATED (PII + WCAG 2.2 AA + OAuth2).
- **Compute model:** ADR-0002 — EC2 + ALB for the sync API; Lambda/EventBridge reserved
  for the async reminder scan (not in S0/S1).
- **Inputs read:** `workspace/tdd-todo-app.md`, `workspace/security-review-s0-s1.md`,
  ADR-0002, ADR-0005, `reliability/{slo-policy,disaster-recovery,flags-registry}`.

> ## ⚠️ REGULATED — Segregation of duties (deploy authorizer)
> **Gate 6 authorizer MUST differ from the Gate 5 merge approver (Jim).** Jim approved
> the PR merge (Gate 5, audit #5). A **different human** must authorize this deploy
> (Gate 6). The PM records `DEPLOY_AUTHORIZED` with that second identity + timestamp +
> SHA in the audit trail before staging deploy runs. Production release additionally
> runs through a **GitHub Environment with a required reviewer** (release authorization),
> distinct from the merge approval.

> ## What this plan does NOT do without approval
> This is a **plan**. No stack is created, no secret seeded, no deploy run until a human
> approves Gate 6. Staging deploy proceeds on approval; **production is a separate
> go/no-go** (see §5 Node-26 LTS gate + §3 ramp) and needs the GitHub-Environment reviewer.

---

## 0. Artifacts

CloudFormation lives in `infrastructure/` (IaC, no console drift), parameterized by
`Environment` (`staging` | `production`), deployed in dependency order:

| # | Template | Provisions |
|---|----------|------------|
| 10 | `infrastructure/10-network.yaml` | VPC, 3 subnet tiers × 2 AZ, NAT, VPC endpoints, SGs |
| 20 | `infrastructure/20-data.yaml` | KMS CMK, RDS Postgres, ElastiCache Redis, Secrets Manager secrets |
| 30 | `infrastructure/30-compute.yaml` | ALB, ASG/EC2, least-privilege instance IAM role |
| 40 | `infrastructure/40-edge-waf.yaml` | WAFv2 WebACL + ALB association |
| — | `infrastructure/bootstrap-db-roles.sql` | F7 `app_runtime` / `app_migrator` role split |

---

## 1. Staging deploy steps

Deploy is **decoupled from release**: infra + code go to staging with the
`team_todo_mvp` flag **OFF** (dark). Flag ON is a separate, ramped step (§3).

**S0 — Preconditions (verify, don't assume).**
- Gate 5 recorded APPROVED (audit #5) and CI `all-green` is green at the deploy SHA.
  Deploy builds the **exact reviewed SHA** — no rebuild from `main` HEAD drift.
- `DEPLOY_AUTHORIZED` recorded by a human ≠ Jim (SoD gate above).
- tsx-on-Node-26 smoke test green (ADR-0005 (d)): `dev/watch` + `migrate:up`/`migrate:down`
  under `NODE_OPTIONS="--import tsx"` on Node 26. Blocks deploy if red.

**S1 — Network + data + compute + edge stacks (staging).**
```bash
aws cloudformation deploy --stack-name ttd-staging-network \
  --template-file infrastructure/10-network.yaml \
  --parameter-overrides Environment=staging SingleNatGateway=true \
  --capabilities CAPABILITY_NAMED_IAM
aws cloudformation deploy --stack-name ttd-staging-data \
  --template-file infrastructure/20-data.yaml \
  --parameter-overrides Environment=staging
aws cloudformation deploy --stack-name ttd-staging-compute \
  --template-file infrastructure/30-compute.yaml \
  --parameter-overrides Environment=staging \
    CertificateArn=<acm-arn> ArtifactUrl=<s3-artifact-url> \
  --capabilities CAPABILITY_NAMED_IAM
aws cloudformation deploy --stack-name ttd-staging-edge \
  --template-file infrastructure/40-edge-waf.yaml \
  --parameter-overrides Environment=staging
```

**S2 — Seed secret VALUES out-of-band (never in git/CFN).** The `20-data` stack creates
the OAuth-client-secret and session-pepper secrets as **empty placeholders** with stable
ARNs; DB and Redis credentials are Secrets-Manager-**generated**. Put the two real values
with the CLI (the values never touch the template, git, or logs):
```bash
aws secretsmanager put-secret-value --secret-id ttd/staging/oauth/google-client-secret \
  --secret-string "$GOOGLE_CLIENT_SECRET"      # from the provider console, entered by hand
aws secretsmanager put-secret-value --secret-id ttd/staging/session/pepper \
  --secret-string "$(openssl rand -base64 48)"
```

**S3 — Provision DB roles + apply migrations (F7).** The migration runner (CI/deploy role,
**not** the app role) connects as the RDS master and runs the role bootstrap, then applies
migrations 001–005 **as `app_migrator`**:
```bash
psql "$MASTER_URL" -v migrator_pw="$APP_MIGRATOR_PW" -v runtime_pw="$APP_RUNTIME_PW" \
  -f infrastructure/bootstrap-db-roles.sql
DATABASE_URL="$APP_MIGRATOR_URL" make migrate:up      # app_migrator = DDL
```
The API instances connect as **`app_runtime`** (DML only). CI already proves migration
apply **and rollback** on ephemeral Postgres — that lane is the binding signal that
001–005 `up`/`down` are clean (security review confirmed rollbacks are true inverses,
pre-prod).

**S4 — App config (ARNs + non-secret config only; NO secret values in env).** The launch
template / systemd unit carries only references and public config:
```
NODE_ENV=production   # staging runs the prod build profile
PORT=3001
REDIS_URL=rediss://<ttd-staging-RedisEndpoint>:6379   # rediss:// = TLS (F5)
DATABASE_URL=<app_runtime DSN, password fetched from ttd/staging/db/app_runtime at boot>
OAUTH_CLIENT_ID=<public>
OAUTH_REDIRECT_URI=https://staging.<domain>/api/auth/callback
OAUTH_CLIENT_SECRET_ARN=<ttd-staging-OAuthClientSecretArn>   # ARN, not value (F4)
SESSION_SECRET_ARN=<ttd-staging-SessionPepperArn>            # ARN, not value (F4)
SESSION_COOKIE_SECURE=true
RETURN_TO_ALLOWLIST=/
```
`config.ts` **rejects a literal** where a `*_ARN` is expected (`looksLikeSecretValue`), so
a misconfigured env fails closed at boot rather than leaking.

**S5 — Automated post-deploy smoke test (defines "healthy" — not an agent claim).**
Runs from CI against the live staging ALB; **any failure auto-rolls-back** (§4) and posts
the result to Slack. "Healthy" =:
1. `GET /ping` → `200 {"status":"ok"}` on every ASG target (ELB health checks passing,
   target group all-healthy).
2. `GET /api/me` **without** a session → `401` with the standard error envelope (auth
   wired, no stack trace leak).
3. `GET /api/auth/login?provider=google&returnTo=/` → `302` to the Google authorize URL
   with `state`, `nonce`, PKCE `code_challenge` present (JWKS/secret seams resolve at boot;
   a broken Secrets Manager wiring throws at startup, so a serving instance proves F3/F4).
4. **Real OAuth round-trip against a staging Google test client** → callback issues an
   opaque `ttd_session` cookie (`HttpOnly; Secure; SameSite=Lax`); `GET /api/me` with it →
   `200`. Proves F3 (real JWKS verify) end-to-end, not just the seam.
5. Feature-dark check: `GET /api/teams` → `404` (routes unregistered while flag OFF).
6. TLS: ALB serves only TLS1.2+; port 80 `301`→443; security headers present (F9).
7. `rediss://` session write/read round-trips (TLS to Redis works, F5); RDS reachable from
   app SG only (a connection attempt from outside the app SG is refused, F6).
8. WAF attached: a request matching a KnownBadInputs signature → `403` (F8/edge live).

Health-check + smoke harness: `scripts/smoke-staging.sh` (CI-invoked, wired to auto-rollback).

---

## 2. Must-wire items (F3–F9) — each with the concrete change

| # | Sev | Item | Where wired | Verified by |
|---|-----|------|-------------|-------------|
| **F3** | HIGH | JWKS id-token real verification | **App (software-engineer):** replace `verifyIdToken` placeholder in `apps/api/src/index.ts` with `jose` `createRemoteJWKSet(new URL(issuer + '/.well-known/jwks'))` + `jwtVerify` validating **signature, `iss`, `aud`, `exp`, and `nonce`** (F1). **Infra (devops):** JWKS is a **public** provider URL — *no Secrets Manager ARN needed*; ensure egress allowlist permits `accounts.google.com` + `www.googleapis.com` (via NAT). Security **re-reviews the real verifier before Gate 6**. | Smoke #4 (real round-trip) + security re-review |
| **F4** | HIGH | Secrets Manager least-privilege IAM | `30-compute.yaml` `AppInstanceRole` → `secretsmanager:GetSecretValue` on **enumerated ARNs only** (OAuth client secret, session pepper, `app_runtime` DB cred, Redis auth token) + `kms:Decrypt` on the one CMK. **No wildcard, no ambient creds, IMDSv2-only, SSM instead of SSH.** `app_migrator` secret deliberately NOT granted to the runtime role. App resolver: replace `unwiredSecretResolver` with an AWS SDK `GetSecretValue` resolver (traffic stays private via the Secrets Manager VPC endpoint). | IAM policy review; smoke #3 (boot succeeds ⇒ resolver + grants correct) |
| **F5** | HIGH | Redis private + TLS + KMS | `20-data.yaml` `RedisReplicationGroup`: `TransitEncryptionEnabled: true`, `AtRestEncryptionEnabled: true`, `KmsKeyId: <CMK>`, `AuthToken` from secret; `10-network.yaml` `RedisSecurityGroup` ingress **from app-sg only**, in **data subnets** (no public endpoint). App uses `rediss://` (S4). | Smoke #7 |
| **F6** | HIGH | RDS KMS at rest + inbound restricted | `20-data.yaml` `Database`: `StorageEncrypted: true`, `KmsKeyId: <CMK>`, `PubliclyAccessible: false`, Performance Insights KMS-encrypted; `10-network.yaml` `DbSecurityGroup` ingress **5432 from app-sg only — no 0.0.0.0/0**. (Direct-PII column-level encryption per data-plan tracked with the data-engineer; RDS storage encryption is the Gate-6 control before real PII lands.) | Smoke #7; `aws rds describe-db-instances` shows `StorageEncrypted=true` |
| **F7** | MED | `app_runtime` / `app_migrator` split | `bootstrap-db-roles.sql`: `app_runtime` = `NOSUPERUSER NOBYPASSRLS`, DML-only, non-owner (so S2 `FORCE ROW LEVEL SECURITY` binds it); `app_migrator` = DDL/owner, used only by the migration runner. Two separate Secrets Manager credentials; runtime role never gets the migrator secret. | `SELECT rolbypassrls FROM pg_roles` = false for `app_runtime`; migration runs as migrator |
| **F8** | MED | Rate limiting on `/api/auth/*` | **Edge (devops):** `40-edge-waf.yaml` rate-based WAF rule scoped `STARTS_WITH /api/auth/`, 100 req / 5-min / IP → block. **App (software-engineer):** `@fastify/rate-limit` per-IP/per-session on the auth + write routes, and **bound pre-auth record creation** in Redis (the F8 Redis-fill vector). Both layers. | Smoke #8 + app-level limiter unit test |
| **F9** | LOW | Security headers | **App (software-engineer):** `@fastify/helmet` in `apps/api/src/app.ts` → HSTS (`max-age≥15552000; includeSubDomains`), CSP (API is JSON-only: `default-src 'none'; frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`. (Edge is JSON-only so app-level is sufficient; CloudFront response-headers policy can add them for the SPA later.) | Smoke #6 |

**F3, F8, F9 have an app-code half owned by software-engineer.** Those code changes ride
in a follow-up PR through the normal gates (5 → CI all-green) **before** the production
ramp; staging can deploy with them landed on the branch. The **infra** halves (F4–F7, F8
edge, KMS/SG) are this plan's CloudFormation and are ready on Gate-6 approval.

---

## 3. Progressive rollout plan (feature `team_todo_mvp`, server-evaluated)

Flag registry: `reliability/flags-registry.json` (owner `software-engineer`,
default `false`, `kill_switch: true`, expiry 2026-10-01). **Deploy dark, then ramp.**
S1 exposes only auth (`/api/auth/*`, `/api/me`) — these register **independently of the
flag** so a canary cohort can sign in; the flag gates the (not-yet-built) team feature
routes. So for S0/S1 the ramp is primarily about admitting **auth traffic** and proving
the spine under real load before S2 builds on it.

| Step | Flag state | Cohort | SLIs watched (hold ≥ dwell before advancing) |
|------|-----------|--------|----------------------------------------------|
| Deploy dark | `false` | none (routes 404) | smoke suite green; `/ping` healthy |
| Canary | `false` (auth on for internal) | internal/staff sign-in | p95 `/api/auth/*` + `/api/me`; error rate; Redis conns |
| 1% | `true` @ 1% | 1% of users | **p95 < 500 ms** (ADR-0002 SLO); error rate < 0.5%; availability ≥ 99.9% |
| 10% | `true` @ 10% | 10% | same + Redis memory/evictions; RDS conns vs pool (max 10) |
| 50% | `true` @ 50% | 50% | same + WAF block-rate anomaly; auth failure-rate |
| 100% | `true` @ 100% | all | same; hold 24–48h before flag cleanup |

- **SLIs (per SLO-policy, measured at the edge):** availability (2xx+3xx / total),
  **p95 latency < 500 ms** (ADR-0002), error rate < 0.5%. Measured on the ALB target group
  + app metrics.
- **Auto-halt:** an SLO fast-burn at any step **halts the ramp and auto-flips the flag OFF**
  (kill switch), then pages sre + posts to Slack. sre sets the burn-rate guardrails at
  Gate 7. Error-budget policy gates the *pace* (budget low → slow ramps).
- **Dwell:** hold each step long enough to observe real traffic (min per SLO burn windows);
  don't advance on a quiet window.

### Kill switch (first incident lever — faster + safer than rollback)
Flipping `team_todo_mvp` **OFF** instantly unregisters the team feature routes + unmounts
the web feature barrel **without a deploy**. It's the first mitigation in an incident.
```bash
# AppConfig (server-evaluated flag) - flip to OFF, deploy the config profile:
aws appconfig start-deployment --application-id <ttd> \
  --environment-id <env> --configuration-profile-id <team_todo_mvp> \
  --configuration-version <off-version> --deployment-strategy-id <AllAtOnce>
```
Log the flip to the audit trail (kill-switch flips are material) and post to Slack with
owner + runbook link. **Note:** for S0/S1, flipping OFF does *not* disable `/api/auth/*` or
`/api/me` (they register independently). If the incident is in the **auth path itself**,
the kill switch is insufficient — go to rollback (§4).

---

## 4. Rollback runbook (separate from the kill switch — for infra/auth-level issues)

Order of mitigation: **kill switch → rollback → DR restore**. Each layer rolls back
independently; you rarely need all three.

### 4a. App / code rollback (fastest infra rollback)
The ASG runs an immutable artifact via the launch template. To roll back the app:
```bash
# Point the launch template back at the previous good artifact + roll the ASG.
aws cloudformation deploy --stack-name ttd-<env>-compute \
  --template-file infrastructure/30-compute.yaml \
  --parameter-overrides Environment=<env> ArtifactUrl=<PREVIOUS_GOOD_ARTIFACT> \
    CertificateArn=<acm-arn> --capabilities CAPABILITY_NAMED_IAM
# Rolling update (MinInstancesInService=1) drains + replaces instances with the old build.
```
Auto-triggered: the smoke suite (§1 S5) failing post-deploy **auto-invokes this** with the
prior artifact and posts the result to Slack. Target rollback time: < 10 min.

### 4b. Migration rollback
- **S0/S1 (pre-prod / no real data):** migrations 001–005 `down` are true inverses
  (security-confirmed); `DATABASE_URL="$APP_MIGRATOR_URL" make migrate:down` reverses them.
  CI proves apply+rollback every run.
- **Once real PII/data exists (F13 standing rule):** destructive `down`s (DROP TABLE) are
  **no longer acceptable** — forward-only, additive/backward-compatible migrations
  (add-nullable → backfill → constrain), and recovery is **PITR restore** (§4d), not a
  `down`. This is why the app/code rollback (4a) is decoupled from schema: roll the app back
  to a version compatible with the current schema; don't reverse a data migration in prod.

### 4c. Infra (CloudFormation) rollback
- A failed `cloudformation deploy` **auto-rolls-back** the changeset (stack returns to the
  last stable state). No manual action for a failed create/update.
- To reverse a *successful-but-bad* stack change: redeploy the previous template revision
  (git-tracked in `infrastructure/`). RDS (`DeletionPolicy: Snapshot`) and the KMS key
  (`Retain`) are protected from accidental teardown; prod RDS also has `DeletionProtection`.

### 4d. Data recovery (DR — last resort, SEV1, human-authorized)
- RDS **PITR** (backup retention 14d prod / 7d staging) → restore to a point in time into a
  new instance, repoint the app. **RPO ≈ 5 min** (PITR granularity); **RTO target ≤ 1h**.
- Redis is a **cache/session store, not a system of record** — loss = users re-authenticate;
  no DR restore needed (snapshot retention is for fast warm-restart only).
- DR restore is human-authorized emergency change; audit-logged (`EMERGENCY_CHANGE`);
  postmortem follows.
- **Restore drill:** a scheduled PITR restore drill (devops runs, sre validates measured
  RTO/RPO, recorded as `DR_DRILL`) is required before production carries real PII — an
  untested backup is not a control (`reliability/disaster-recovery.md`). Scheduled at Gate 7.

---

## 5. Node 26 LTS gate (go/no-go — ADR-0005)

- **Node 26 becomes Active-LTS on 2026-10-28. Today is 2026-07-13 → Node 26 is "Current"
  (pre-LTS).**
- **Staging: PROCEED on pre-LTS.** PM has accepted pre-LTS for dev/CI/staging (STATE.md).
- **Production: BLOCKED on pre-LTS without explicit PM re-approval.** If the production
  release is attempted **before 2026-10-28**, this is a **flag for PM decision**: either
  (a) wait for Active-LTS (2026-10-28), or (b) PM explicitly re-approves shipping prod on a
  pre-LTS runtime, recorded in the audit trail. The GitHub-Environment production reviewer
  must confirm this item at release time.
- **Prerequisite either way:** tsx-on-Node-26 smoke test green (ADR-0005 (d)) — gates
  staging too.

---

## 6. AWS cost impact (vs approved $365/mo runtime budget)

Approved (Gate 1): **$365/mo** combined (staging $120 + production $210 + ~$35 buffer;
prior point estimate $330). Delta from the must-wire security items:

| Added by this plan | staging | production | Notes |
|--------------------|---------|-----------|-------|
| KMS CMK (1 key) | $1 | $1 | + negligible request cost |
| Secrets Manager (6 secrets/env) | $2.40 | $2.40 | $0.40/secret/mo |
| WAFv2 (WebACL + 4 rules + requests) | ~$8 | ~$12 | managed groups + rate rule |
| CloudWatch (logs, alarms, dashboard) | ~$5 | ~$10 | log retention 14d/90d |
| ElastiCache encryption (TLS + KMS) | $0 | $0 | no upcharge for encryption |
| RDS encryption + PITR | $0 | ~$2 | storage encryption free; extra backup storage |
| **VPC interface endpoints** (SecMgr, KMS, Logs, SSM) | +~$29 | +~$29 | **but** offsets NAT data-processing |
| NAT data-processing **saved** (ADR-0002 lever) | −~$20 | −~$40 | secrets/logs/KMS/SSM traffic no longer via NAT |

**Net estimate:** staging ≈ **$147/mo**, production ≈ **$226/mo**, combined ≈ **$373/mo**.

This is **~$8 over the $365 approved figure** (driven by WAF + CloudWatch — both required
for the regulated tier). Two levers recover it, per ADR-0002, **without touching the
architecture**:
- **Staging off-hours shutdown** (ASG scale-to-0 + stop RDS nights/weekends) → **−~$40/mo
  staging**, putting combined comfortably back under $365.
- Right-sizing (t4g.small baseline; single-AZ staging) already applied.

**Recommendation:** approve at the current $365 with staging off-hours shutdown applied
(net ≈ $335/mo combined). **No overage requiring separate approval** once the off-hours
lever is on. Recorded in `budget.json`. If the human prefers not to run staging off-hours,
the ~$8 overage needs an explicit AWS-cost overage approval. Spend agent monitors actuals
per environment vs this estimate.

I do **not** see a cost concern warranting a re-architecture route to software-engineer —
the EC2+ALB model (ADR-0002) is already the cost-optimized choice for this SLO.

---

## 7. Monitoring & alerting (wired at deploy, reviewed at Gate 8 for business metrics)

- **CloudWatch:** ALB 5xx + target-group health, p95 target-response-time (SLO alarm at
  500 ms), ASG CPU, RDS connections/CPU/free-storage, ElastiCache memory/evictions, WAF
  blocked-request anomaly. Alarms → SNS → **Slack** with runbook link + owner (this plan).
- **App telemetry** (per CLAUDE.md stack): Sentry (exceptions), Datadog (metrics/SLIs),
  Logz.io (logs — PII-safe per F2 fix), Heap (product analytics, S2+).
- **SLO burn-rate alerts** (sre-owned, slo-policy.md): fast-burn = page, slow-burn = ticket.
- Business/usage metrics instrumentation is the data-engineer's Gate-8 deliverable — out of
  scope here; this plan wires the infra/reliability SLIs the ramp (§3) watches.

---

## 8. Audit-trail entries this deploy produces

`DEPLOY_AUTHORIZED` (human ≠ Jim, Gate 6) → `DEPLOYED` staging (with smoke result + SHA) →
per-ramp `flag` change events → any kill-switch flip → `DR_DRILL` (Gate 7) →
`DEPLOY_AUTHORIZED` production (GitHub-Environment reviewer) → `DEPLOYED` production. The PM
records each with identity + timestamp + SHA via `audit-append.sh`.

---

## Gate 6 approval checklist (for the human authorizer ≠ Jim)

- [ ] Deploy authorizer identity ≠ Gate 5 approver (Jim) — SoD.
- [ ] CI `all-green` at deploy SHA `a994e49…`.
- [ ] Must-wire F3–F9 dispositions accepted (infra halves ready; app halves land pre-prod-ramp).
- [ ] Security re-review of the real JWKS verifier scheduled before production (F3).
- [ ] Cost: $365 with staging off-hours shutdown (or explicit ~$8 overage approval).
- [ ] Node-26 pre-LTS: staging OK; **production is a separate go/no-go** (2026-10-28 or PM re-approval).
- [ ] Rollback path (§4) + auto-rollback-on-smoke-failure understood and accepted.

---

NEXT: route to pm — Gate 6 deploy plan ready for human Infra Plan Review | gate: human:6 Infra Plan Review
