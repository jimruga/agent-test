# Security Review — S0/S1 Foundation + Auth (REGULATED, pre-Gate-5 deep review)

- **Reviewer:** security agent (read-only)
- **Date:** 2026-07-11
- **Target:** branch `feature/s0-s1-foundation-auth` (staged, uncommitted) — Fastify
  `apps/api` OAuth2 authorization-code + PKCE auth slice (login/callback/me/logout,
  session cookie, session-store seam, feature-flag seam, secret-resolver seam) and
  migrations `001`-`005` (extensions, users, oauth_identities, teams, memberships).
- **Verification status:** This is a **static / pre-commit** review of code on disk.
  The sandbox has no npm-registry/DB network, so nothing has been executed. The
  binding objective signal (`verify.sh` all-green + CI migration apply/rollback +
  independent review) is **still pending human `git commit` + CI**. No finding below
  is a substitute for that CI signal.
- **Overall:** the auth slice is well-built and security-conscious — server-side-only
  token handling, opaque session cookie with correct flags, single-use PKCE pre-auth,
  state (CSRF) + nonce (replay) checks, session fixation avoided (fresh id post-auth),
  fail-closed JWKS + secret seams, no PII in logs at the call sites, no tenant bypass
  baked in. Findings are hardening + wiring, not structural defects.

Legend: **MUST-FIX (Gate 5)** blocks merge · **MUST-WIRE (Gate 6)** blocks deploy ·
**TRACK** = accepted deferral with a condition.

---

## MUST-FIX before Gate 5 (merge) — application → software-engineer

### F1 [MEDIUM] Nonce replay check fails OPEN on a missing nonce
- **File:** `apps/api/src/auth/routes.ts:91`
- `if (result.claims.nonce !== undefined && result.claims.nonce !== preAuth.nonce)` —
  a token that omits the `nonce` claim skips the replay check entirely. We always send
  a `nonce` on the authorize request (`pkce.ts`/`routes.ts:41`), so per OIDC the ID
  token MUST echo it; an absent nonce must be **rejected**, not waved through.
- **Risk:** replay of an ID token that lacks (or is stripped of) the nonce claim once
  a real `verifyIdToken` is live (OWASP A07). Cheap logic fix; do it now so it is
  correct before the JWKS verifier lands.
- **Fix:** require `result.claims.nonce` to be present AND equal to `preAuth.nonce`
  (reject undefined). Ideally enforce nonce binding inside `verifyIdToken` as well, so
  the guarantee does not depend solely on the route.
- **Owner:** software-engineer.

### F2 [MEDIUM] Full error object logged at 500 can capture PII via pg error fields
- **File:** `apps/api/src/platform/error-envelope.ts:50` — `req.log.error({ err }, ...)`.
- **Risk:** node-postgres errors carry `detail`/`where`/`table`/`column` fields that
  frequently include **row values** (e.g. the conflicting `email` on a unique
  violation). Serializing the whole `err` at error level can write regulated PII
  (`users.email`, `display_name`) into shipped logs (Logz.io/Sentry) — OWASP A09 and a
  privacy/retention violation. The client body is already generic (good); the leak is
  server-side log content.
- **Fix:** log a whitelist only — `err.message`, `err.code`, `err.name`, stack — and
  explicitly strip pg `detail`/`where`/`parameters`/`values` (or use a redacting
  serializer). Add a regression test asserting no PII field is serialized.
- **Owner:** software-engineer.

---

## MUST-WIRE before Gate 6 (deploy) — not merge blockers for this slice

### F3 [HIGH] JWKS ID-token verification not wired — CONFIRMED fail-closed
- **File:** `apps/api/src/index.ts:46` (`verifyIdToken` placeholder throws);
  injected into `createGoogleProvider` (`oauth-provider.ts:107`).
- **Confirmation (the engineer's ask):** it **truly fails closed** — the placeholder
  `throw`s; `exchangeCode` calls it before returning any claims, and `routes.ts:84-89`
  catches the throw and returns a 400 without creating a session. **An unverified ID
  token cannot establish a session today.** No unverified-session path exists.
- **Fix before deploy:** real `jose` `createRemoteJWKSet` + `jwtVerify` validating
  **signature, `iss`, `aud`, `exp`** (and `nonce`, see F1). Security must re-review the
  real verifier before Gate 6.
- **Owner:** software-engineer (impl) → security re-review.

### F4 [HIGH] Secrets Manager resolver unwired — CONFIRMED fail-closed
- **File:** `apps/api/src/platform/secrets.ts` (`unwiredSecretResolver` throws);
  wired in `index.ts:52`, consumed via `resolveClientSecret` (`oauth-provider.ts:85`).
- **Confirmation:** fails closed (throws) — no bogus/empty secret can silently proceed.
  Config (`config.ts:42-54`) also actively rejects a literal value where a `*_ARN` is
  expected. Secrets are referenced by ARN only; no secret values found in code,
  config, fixtures, migrations, or logs (`.gitleaks.toml` + pre-commit + CI secret-scan
  present).
- **Fix before deploy:** real AWS Secrets Manager resolver with **least-privilege IAM**
  — read ONLY the OAuth client-secret ARN and the session-pepper ARN (`config.oauth.
  clientSecretArn`, `config.sessionSecretArn`); no wildcard.
- **Owner:** devops.

### F5 [HIGH] ElastiCache/Redis provisioning must be encrypted + network-isolated
- **File:** `apps/api/src/index.ts:53`, `auth/session-store.ts` (`SessionRecord` holds
  provider **accessToken/refreshToken** in Redis).
- **Risk:** the session store holds regulated OAuth tokens server-side. Redis must be
  **private-subnet only** (no public endpoint), **encryption at rest (KMS)**, and
  **TLS in transit**. `index.ts:53` defaults `redis://localhost:6379` (plaintext) — the
  production URL must be `rediss://` (TLS) into the VPC.
- **Owner:** devops. (aws-security: no cache with a public endpoint; encrypt at rest.)

### F6 [HIGH] Regulated-PII encryption at rest (KMS) + RDS encryption
- **Files:** `migrations/002_create_users.ts` (`email`, `display_name`),
  later `invites.email`; `data-plan §3.1`.
- **Risk:** columns are declared plaintext; the TDD/data-plan require KMS encryption at
  rest for direct-PII columns. Schema is encryption-ready (plain columns), but the
  actual control (RDS storage encryption at minimum; column/application-level KMS per
  the data-plan) must be in place **before real PII is stored** (Gate 6). Confirm RDS
  `StorageEncrypted` + KMS key ARN in the CloudFormation.
- **Owner:** devops (RDS/KMS) + software-engineer (if column-level app encryption).

### F7 [MEDIUM] DB role split must be provisioned — RLS backstop is void without it
- **File:** `apps/api/knexfile.ts` (comment names `app_runtime`/`app_migrator`, not yet
  provisioned); `data-plan §2.4`.
- **Risk:** the future RLS defense-in-depth (F10/F11) is meaningless if the API connects
  as the table owner or a `BYPASSRLS`/superuser role. The runtime role MUST be a
  non-owner, **not `BYPASSRLS`**, DML-only role so `FORCE ROW LEVEL SECURITY` actually
  binds it; migrations run as a separate DDL role.
- **Owner:** devops (IAM-auth RDS roles, ARN-referenced). Needed by S2 RLS; provision
  now so S2 is not blocked.

### F8 [MEDIUM] No rate limiting on the auth surface
- **Files:** `apps/api/src/auth/routes.ts` (login/callback/logout); TDD §2.1 expects
  rate-limit middleware in front of auth + WAF at the edge.
- **Risk:** `GET /api/auth/login` writes a pre-auth record to Redis on every hit —
  unauthenticated, unbounded → Redis-fill / resource-exhaustion (DDoS L7), plus no
  throttle on callback abuse. No app-level limiter exists yet.
- **Fix before production exposure:** WAF managed rules + rate-based rules + Shield at
  the edge (**devops**); establish an app-level per-IP/per-session rate-limit seam on
  the auth + write paths (**software-engineer**). Bound pre-auth creation.
- **Owner:** devops (edge) + software-engineer (app seam).

### F9 [LOW] Security response headers not set
- **File:** `apps/api/src/app.ts` (no HSTS / `X-Content-Type-Options: nosniff` /
  `Referrer-Policy` / frame-ancestors).
- **Fix:** set at the edge (CloudFront/ALB) or a Fastify plugin. API is JSON-only so
  blast radius is small, but HSTS + nosniff are expected for a regulated service.
- **Owner:** devops (edge) preferred.

---

## RLS decisions routed to security

### F10 [MEDIUM · TRACK] Auth-table RLS (users/oauth_identities/sessions) deferral
- **Assessment:** deferring RLS on `users`/`oauth_identities` for S1 is **acceptable**.
  These are not team-owned; S1 touches them only via identity-keyed lookups
  (`KnexUserRepository`: by `id`, by `user_id`, by `(provider, provider_subject)`), and
  there is no cross-user read surface exposed. A naive `team_id`-style policy does not
  fit, and a `user_id`-keyed policy genuinely conflicts with the **pre-auth** lookup
  (find-or-create by `provider_subject`/`email` happens *before* any session/user
  context exists) — the data-plan (§2.3) flagged this correctly.
- **Condition (before/with S2, not a Gate-5 blocker for this PR):** decide and record
  (ADR) the protection model — the recommended one is a **narrower auth-service DB
  role/connection** whose grants cover the pre-auth identity lookup as an explicit,
  audited carve-out, with the general runtime role otherwise least-privilege. This
  depends on F7 (role split). `sessions` table is not created in this PR (deferred), so
  no RLS gap exists for it yet.
- **Owner:** software-engineer/data-engineer (design + ADR) → security sign-off;
  devops (role provisioning).

### F11 [LOW · TRACK] memberships/teams RLS deferred to S2 — SAFE
- **Assessment:** **safe to defer.** Enabling `FORCE ROW LEVEL SECURITY` on
  `memberships` now — before the S2 scoped-repository seam sets the `app.team_id` GUC
  per transaction — would make `current_setting('app.team_id', true)` NULL and
  fail-close every membership read, breaking `GET /api/me` for all S1 users. S1 exposes
  **no** team-scoped read/write surface (feature routes are flag-gated off / not built),
  so the deferred risk window is real but currently empty.
- **Condition:** RLS for the team-owned tables MUST land in the **same PR** as S2's
  first team-scoped endpoint (same branch-policy discipline), with the pooled-connection
  per-transaction GUC reset (`set_config(..., true)`) verified by QA's tenant-bleed test
  (TDD §4.5 item 7). Do not let S2 add a team endpoint ahead of the RLS migration.
- **Owner:** data-engineer + software-engineer at S2.

---

## Tenant-isolation groundwork — CLEAN

### F12 [INFO] No future-scoping bypass is baked into S1
- `GET /api/me` derives identity+memberships **server-side** from the session's
  `userId` (`user-repository.knex.ts:63-75`, filtered `status='active'`); no client
  `teamId` is trusted anywhere (no team endpoints exist yet). Feature routes are flag-
  gated (registered only when `team_todo_mvp` is ON), so the tenant surface is genuinely
  dark. Nothing here pre-empts the S2 server-derived `TenantContext`/scoped-repo model.

---

## Migrations 001-005 — security assessment (CLEAN, with one forward-looking note)

- **Constraints (good):** partial-unique `users(email) WHERE status='active'` prevents
  a tombstoned/nulled email from colliding with (or being an oracle for) a new signup;
  `CHECK (status<>'deleted' OR deleted_at IS NOT NULL)` keeps the tombstone consistent;
  every FK has an explicit `ON DELETE` (CASCADE / SET NULL), none left to `NO ACTION`;
  `UNIQUE(provider, provider_subject)` anchors identity to the provider subject (not
  email) — **prevents email-based account takeover**; `UNIQUE(team_id, user_id)` on
  memberships. UUIDv7 app-side PKs → non-enumerable, no `gen_random_uuid` dependency.
- **Sentinel "Deleted user" row:** seeded with a fixed UUID and **NULL email** — no PII
  value in the migration; supports erasure re-attribution (D3) without a magic NULL.
- **No secrets, no PII values, no literal example data** beyond the sentinel's fixed
  non-personal strings — confirmed across all five files.
- **No OAuth tokens in Postgres** — `oauth_identities` deliberately has no token
  columns (tokens are Redis-only). Correct per TDD §5.
- **Rollback:** every `down` is a true inverse (pre-prod, no data) — fine for CI's
  apply+rollback lane.
- **F13 [LOW] Forward-looking:** once any of these tables hold real data in a deployed
  env, destructive `down`s (DROP TABLE) are no longer acceptable rollbacks — migrations
  `006+` must be additive/backward-compatible (add-nullable → backfill → constrain).
  Already flagged by the data-engineer (data-plan §1.16); reinforcing as a standing
  precedent. Owner: data-engineer.

---

## Other notes (non-blocking)

- **F14 [LOW] CSRF double-submit token seam not yet present.** Acceptable for S1:
  cookie is `SameSite=Lax` (blocks the cross-site POST cookie), and the only write is
  `POST /api/auth/logout` (worst case: forced logout, low impact). **MUST** be built
  before S2 introduces state-changing write endpoints (TDD §5.2). Owner: software-
  engineer at S2.
- **F15 [INFO] Account-linking by email not implemented.** A second identity whose
  email collides with an existing active user would hit the partial-unique and throw
  (→ 500) rather than link — fails safe (no takeover). S1 is single-provider (Google);
  fine to leave. If multi-provider linking is added later, design it explicitly.
- **F16 [INFO] Cookie hardening (optional):** consider `__Host-` prefix on the session
  cookie (already host-only, `Path=/`, no `Domain`, `Secure` default-on) for defense in
  depth. Not required.
- **Not a security item:** `knexfile.ts` uses a default export against the named-exports-
  only rule (knex CLI convention) — routed to **code-reviewer**, noted here only so it
  is not mistaken for a security finding.

---

## Disposition

- **MUST-FIX before Gate 5 (merge):** F1, F2 → software-engineer. Re-review after fix.
- **MUST-WIRE before Gate 6 (deploy):** F3 (software-engineer, security re-review),
  F4/F5/F6/F7/F9 → devops; F6 also software-engineer if app-level; F8 → devops + software-
  engineer.
- **Tracked deferrals (conditions above, not Gate-5 blockers):** F10, F11, F13, F14.
- **Clean:** F12 (tenant groundwork), migrations 001-005 constraints/secrets/PII.
- Objective verification (CI all-green + migration apply/rollback + independent review)
  remains pending human commit + CI — this review does not clear that gate.

---

## Re-verification — F1 + F2 (pre-Gate 5)
Date: 2026-07-13
SHA: a994e49b1e9f2a83ab6609b61c88e1f99e9a546c

**F1 (nonce fail-closed):** CONFIRMED FIXED. `apps/api/src/auth/routes.ts` — (a) the
issued nonce is carried on the single-use pre-auth record fetched at callback entry
via `takePreAuth` (line 85); a missing pre-auth record rejects at line 86 *before*
`exchangeCode` is called. (b) The ID-token nonce claim is now checked fail-closed at
lines 106-111: `result.claims.nonce === undefined || !timingSafeStrEqual(result.claims.nonce, preAuth.nonce)`
returns 400 — an absent/stripped nonce is rejected, not skipped (constant-time compare).
(c) `takePreAuth` is single-use, consuming the whole pre-auth record (incl. nonce) on
first use → replay protection intact.

**F2 (PII-safe logs):** NOT FIXED (residual). `apps/api/src/platform/error-envelope.ts`
`safeErrorLogFields` (lines 51-68) correctly uses an ALLOWLIST and never spreads `err`,
so pg `detail`/`hint`/`where`/`parameters` (the exact original leak — conflicting row
values) ARE dropped by construction — that half of the finding is genuinely fixed.
BUT the allowlist still forwards `err.message` (line 63) and `err.stack` (line 64),
which the re-verification acceptance criteria (b)/(c) require to be stripped. Residual
risk: an Error whose `.message` embeds an OAuth token-endpoint response body or
application-interpolated PII (email) is written verbatim to shipped logs (Logz.io/
Sentry), and `stack` re-embeds the message. No pino `redact` compensates — `app.ts:13`
configures the logger with only a level, no redact paths. To clear: drop `message`
and `stack` from the returned record (keep `name`, `code`, `statusCode`, `type`), or
add a redacting serializer; add a regression test asserting no `message`/`stack`/
`detail`/`hint` field is serialized.

Overall: FINDINGS REMAIN — F1 confirmed fixed; F2 partially fixed (pg row-value fields
stripped) but `message` + `stack` still forwarded, failing the stated criteria. Route
F2 back to software-engineer; re-review after fix.

---

## Re-verification 2 — F2 final (pre-Gate 5)
Date: 2026-07-13

**F2 (PII-safe logs):** CONFIRMED FIXED. `apps/api/src/platform/error-envelope.ts`
`safeErrorLogFields` (lines 57-72) now returns ONLY structural fields —
`name`, and conditionally `code`/`statusCode` when present (plus `{ name:'NonError',
type }` for a non-Error throw). `message` and `stack` are no longer forwarded, so an
Error whose `.message` embeds an OAuth token-endpoint response body or interpolated
PII (email) is no longer written to shipped logs. The allowlist approach is preserved:
the record is built by explicit field construction and never spreads `err`, so pg
`detail`/`hint`/`where`/`parameters` and any future driver field are dropped by
construction. Regression test (`error-envelope.test.ts:32-84`) asserts the safe fields
`name`/`code`/`statusCode` are present AND that `message`/`stack`/`detail`/`hint`
(and `where`/`table`/`column`/`schema`/`constraint`/`parameters`/`routine`) are absent,
plus a belt-and-suspenders check that the email value appears nowhere in the record.

Overall: CLEAN — F1 + F2 both confirmed fixed. (Objective CI signal — verify.sh
all-green + independent review — remains pending human commit + CI per branch policy.)
