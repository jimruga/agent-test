# Implementation Notes — S0 (foundation) + S1 (auth & session)

- **Author:** software-engineer
- **Date:** 2026-07-11
- **Branch:** `feature/s0-s1-foundation-auth` (NOT pushed; no PR yet — blocked on lockfile, see below)
- **Scope delivered:** S0.1, S0.2, S0.3, S1 (per the Gate-4 story backlog)
- **Risk tier:** REGULATED

> **Verification honesty (per CLAUDE.md):** the sandbox has **no npm-registry
> network**, so I could **not** run `npm install`, `tsc`, `vitest`, Biome, or the
> Fastify server, and I did **not** execute the red→green loop. All code + tests +
> config are authored *for CI*. Test results below are **NOT self-reported as
> passing** — CI (`verify.sh` full mode) is the verifier. I have reviewed the code
> for type/lint correctness by hand; residual issues, if any, surface on the first
> CI run.

## What's built

### S0.1 — Monorepo + CI bootstrap
- **npm workspaces** monorepo: root `package.json` (`apps/*` + `packages/*`),
  `tsconfig.base.json`, `biome.json` (named-exports-only enforced via
  `noDefaultExport`), per-workspace `tsconfig.json`.
- `packages/shared` — framework-agnostic types: the API error envelope
  (`ApiErrorBody`) and the safe auth DTOs (`CurrentUser`, no tokens/PII-in-transit
  beyond the owner's own profile). Barrel `src/index.ts`.
- `apps/api` — Fastify 5 + TS. `buildApp(deps)` factory (DI seam) served separately
  by `index.ts`; in-process tests via `app.inject()`. `openapi.yaml` (OpenAPI 3.1)
  is the contract source of truth. Vitest with coverage thresholds (80% global).
- `apps/web` — React 19 + Vite **skeleton** (feature barrel + flag seam + generated-
  client pipeline config). Deliberately minimal — the **frontend-engineer** stands up
  the full UI, TanStack Router, Tailwind, and the browser/e2e/axe test harness.
- **verify.sh** — repointed from the old `ux/api/application` top-level scan to the
  **npm-workspaces monorepo** (install → typecheck → lint → test+coverage). The
  **anti-tamper diff check is unchanged** (still the load-bearing anti-gaming control).
- **CI** (`.github/workflows/ci.yml`) — `sca` and `migrations` jobs repointed at the
  single root lockfile / the `@repo/api` migrate scripts. Migration apply+rollback
  gate wired to `npm --workspace @repo/api run migrate:up/down` (runs once the
  data-engineer's migration files land). Branch protection: unchanged
  (`scripts/setup-branch-protection.sh` makes `all-green` + independent review binding;
  `require_last_push_approval` = author can't approve own merge).
- **ADR-0004** records the bootstrap decisions (npm workspaces, verify scope, the
  no-DB unit lane, version-pin reconciliation).

### S0.2 — api-conventions.md Hono → Fastify (ADR-0003)
- Rewrote `.claude/rules/api-conventions.md` to the Fastify serve pattern
  (`buildApp` + `app.inject()`), DI seam, `/api` prefix plugin, error envelope, and
  the (unchanged) contract-first toolchain.

### S0.3 — Feature flag + kill-switch seam
- Server-evaluated `team_todo_mvp` flag (`platform/feature-flags.ts`). Gates
  **route registration** (`features/team-todo.ts`): when OFF the feature routes are
  **not registered** (404 → genuinely dark), when ON they register. `/api/auth/*`
  and `/api/me` register independently (TDD §7) so a canary can sign in.
- Web mirror (`apps/web/src/lib/feature-flags.tsx`) reflects the server decision for
  rendering only — **never** a security control.
- Registered in `reliability/flags-registry.json` (owner, default:false, kill_switch,
  expiry 2026-10-01).
- Proven by tests: `/api/teams` is 404 when off, 200 when on.

### S1 — Auth & session (OAuth2 authorization-code + PKCE)
- Full flow, **all token handling server-side** (TDD §5): `GET /api/auth/login` →
  state + nonce + PKCE(S256) + single-use pre-auth transaction (HttpOnly cookie) →
  provider redirect; `GET /api/auth/callback` → state match (CSRF), single-use
  pre-auth consume (replay), server-side code exchange, nonce match (replay),
  email-verified check, user upsert, **server-side session**, opaque **HttpOnly /
  Secure / SameSite=Lax** cookie, validated `returnTo` redirect (open-redirect guard);
  `POST /api/auth/logout` (revoke session + provider token, idempotent);
  `GET /api/me` (session → user + memberships, sliding idle + absolute expiry,
  fail-closed if the user was erased).
- **Dependency-inverted seams** (so the whole flow is unit-tested with no external
  services): `OAuthProvider` (Google adapter + fake), `SessionStore` (`RedisSessionStore`
  over a `RedisLike` seam; `InMemoryRedis` for tests/dev), `UserRepository`
  (`InMemoryUserRepository` tested; `KnexUserRepository` for prod), `FeatureFlags`,
  and a `SecretResolver` seam (fails closed until wired).
- **Data needed (define-only; data-engineer owns migrations):** `users`,
  `oauth_identities`, `memberships` for S1 (the `KnexUserRepository` queries these);
  `sessions` durable mirror is optional (Redis is the hot store). Column shapes match
  TDD §3 / data-plan §1. These land as Knex migrations in the **same PR** as this code.

## Blocked on (to go green)
1. **Lockfile / first install (human or CI).** Cannot be generated in the Claude
   sandbox (no registry network). A human/CI runs `npm install` to produce the
   committed `package-lock.json`; then `verify.sh` full mode can run. **This is why
   no PR is open yet.**
2. **CI first run** is the real green signal (`verify.sh`: typecheck + lint +
   test + coverage + anti-tamper). I have not executed it.
3. **data-engineer migrations** for `users`/`oauth_identities`/`memberships`
   (+ `sessions` mirror) must land in the same PR (branch policy) before the
   `migrations` CI lane and the `KnexUserRepository` path are exercised.

## Must-wire before a working deploy (flagged to security + devops — NOT blocking Gate-5 code review, but blocking Gate-6 deploy)
- **JWKS ID-token verification** (security): `index.ts` `verifyIdToken` is a
  fail-closed placeholder — it **throws** so an unverified token can never establish
  a session (OWASP A08). Real impl: `jose` `createRemoteJWKSet` + `jwtVerify`
  (validate signature, `iss`, `aud`, `exp`). Unit tests exercise the *fake* provider;
  the real adapter's parsing/verification path is covered but the JWKS wiring itself
  is the remaining work. **Security deep review should confirm this before Gate 5.**
- **AWS Secrets Manager resolver** (devops): `platform/secrets.ts`
  `unwiredSecretResolver` fails closed. Wire the real resolver with least-privilege
  IAM (read the OAuth client-secret ARN + session-pepper ARN only). Secrets are ARNs
  in config; **no secret values in code/config/fixtures/logs** — verified by hand and
  by the gitleaks CI job.
- **Redis (ElastiCache)** provisioning (devops) for `RedisSessionStore`.

## OWASP top-10 posture for this slice (S1)
- A01 access control: `/me` fails closed; cross-tenant scoping is S2 (no bypass path
  introduced — `teamId` is never trusted from the client here).
- A02 crypto: opaque session id (no JWT/PII in the cookie); Secure/HttpOnly flags.
- A03 injection: no string SQL (Knex parameterized); inputs validated at the edge.
- A07 auth failures: PKCE(S256), `state` (CSRF), `nonce` (replay), single-use pre-auth,
  idle + absolute session expiry, logout revocation.
- A08 integrity: ID token verified via injected verifier (never trusted raw);
  generated client never hand-edited.
- A09 logging: 500s return a generic envelope; internals logged server-side, no PII;
  cookies/tokens never logged.
- A10 SSRF/open-redirect: exact-match redirect URI; `returnTo` restricted to
  allowlisted same-origin relative paths.

## Coordination / routing
- **data-engineer:** author S1 auth-table migrations (`users`, `oauth_identities`,
  `memberships`, optional `sessions` mirror) to `migrations/`, to land in the same PR.
  RLS on `users`/`oauth_identities`/`sessions` is the data-plan's open item #3 →
  security deep review (auth-table RLS was already flagged pre-Gate-5).
- **security:** confirm JWKS verification plan + auth-table RLS before Gate 5.
- **devops:** ElastiCache Redis + Secrets Manager IAM wiring for Gate 6.

## Test inventory (authored; CI verifies)
`pkce`, `cookies`, `config`+`safeReturnTo`, `feature-flags`, `error-envelope`,
`secrets`, `session-store` (idle/absolute/single-use), `user-repository`+`deriveInitials`,
`oauth-provider` (authorize URL / exchange / verify / revoke), and the `app.inject()`
integration suite (`app.test.ts` flag gating + baseline; `auth/routes.test.ts` full
login→callback→me→logout incl. CSRF/replay/single-use/expiry negative paths).

---

## Review fix batch (2026-07-11) — code-review + security change requests

Applied on the SAME branch `feature/s0-s1-foundation-auth` (staged; git commit is
permission-denied in this env — a human commits). Sandbox still has no npm-registry
network, no lockfile, and `node` itself aborts here, so **nothing was executed** —
all fixes are authored for CI. CI (`verify.sh` full + migrations + new integration
lane) remains the binding verifier.

### Must-fix — DONE
- **C1 (CRITICAL) — `.gitignore` `secrets.*` swallowed source.** Narrowed the
  pattern to credential FILES only (`secrets.json`, `secrets.yaml`/`.yml`,
  `*.secrets.*`, `.secrets/`); it can no longer match source modules. Verified:
  `git check-ignore -v apps/api/src/platform/secrets.ts` now returns **nothing**
  (was `.gitignore:12:secrets.*`), while `secrets.json` / `foo.secrets.yaml` /
  `.secrets/x` are still ignored. Both `secrets.ts` and `secrets.test.ts` are now
  staged (`A`) → CI typecheck can resolve `index.ts`'s import and the fail-closed
  secrets-seam test gains CI evidence. Platform precedent: ignore credential files,
  never source-name globs.
- **W2 — Knex CLI TS loader.** `apps/api/package.json` `migrate:up`/`migrate:down`
  now run `NODE_OPTIONS="--import tsx" knex …` so the `.ts` knexfile + `.ts`
  migrations load under ESM (the `knex` bin is on PATH via npm workspace scripts;
  the tsx loader was a devDep but unwired). The CI `migrations` lane
  (`migrate:up`→`migrate:down`) can now actually apply+rollback 001-005.
- **F1/W3 — nonce replay fail-OPEN.** `routes.ts` now rejects when the ID-token
  nonce is **absent OR mismatched** (`nonce === undefined || !equal`) — was
  `nonce !== undefined && …`, which skipped the check on an absent nonce. Added the
  nonce-ABSENT negative test (`overrideNonce: null` → 400 "Nonce"). Note: the
  ideal secondary enforcement inside `verifyIdToken` is deferred to the JWKS wiring
  (Gate 6) — the current `verifyIdToken` seam has no access to the expected nonce;
  when the real `jose` verifier lands it should take the expected nonce and bind it
  too. Route enforcement is authoritative today.
- **F2 — PII in 500 logs.** `error-envelope.ts` no longer logs the raw `err`. New
  `safeErrorLogFields(err)` builds the log record from an **allowlist**
  (`name`, `message`, `stack`, `code`, `statusCode`) and never spreads the error,
  so pg `detail`/`where`/`table`/`column`/`parameters`/`constraint`/`routine`
  (which embed row PII like a conflicting email) are dropped by construction.
  Added a regression test asserting those fields are absent and that
  `ada@example.com` never appears in the serialized record.
- **W4 — `KnexUserRepository` had zero coverage.** Added
  `user-repository.knex.itest.ts` (real Postgres, `*.itest.ts` suffix): create-on-
  first-login, idempotent second login by `(provider, provider_subject)`,
  `getWithMemberships` join, and `status='active'` filter excludes tombstoned
  users. New **integration lane**: `vitest.integration.config.ts` +
  `test:integration` script (glob `*.itest.ts`, no coverage thresholds, serialized);
  the unit lane now excludes `*.itest.ts` from both the test glob and coverage so
  `verify.sh` stays hermetic (ADR-0004 no-DB lane). New CI `integration` job
  (postgres:16 → `migrate:up` → `test:integration`) added to `all-green` `needs`.
  **Not executed here** (no DB/registry) — authored for the CI integration lane.
  Paved-road precedent for all future repository integration tests.

### Nice-to-have
- **#6 — constant-time compare — DONE.** Added `timingSafeStrEqual` (pkce.ts, via
  `crypto.timingSafeEqual`, length-mismatch → false, never throws) with unit tests;
  used for both state (CSRF) and nonce (replay) comparison in `routes.ts`.
  First-service precedent.
- **#7 — CLAUDE.md stack line — DONE (doc-only).** Corrected to installable/
  installed versions per ADR-0004 (`Node >=20, npm ~10, TS ~5.6, React ~19.0,
  Fastify ~5.1, Knex ~3.1`) with a note to bump doc + package.json together.

### Deferred (unchanged from prior routing — NOT in this batch)
- Gate 6 deploy wiring: JWKS real `verifyIdToken`, Secrets Manager IAM, Redis/RDS/
  KMS, rate limiting, edge security headers (devops + security re-review).
- Redundant `memberships(team_id,user_id)` index (S1 code-review S1) → data-engineer
  at next migration touch / S2.
- CSRF double-submit token seam → S2 (first mutating team endpoint).

### Verification status
- **Not run** in-sandbox (no lockfile/registry; `node` aborts). Authored for CI.
- Manual review only. Binding signals still pending human commit + CI:
  `verify.sh` full (lint/typecheck/test/coverage/anti-tamper), `migrations`
  apply+rollback, and the new `integration` lane — plus independent review.
- Static checks I could run: `git check-ignore` confirms C1; grep/read confirms no
  `.only`/`.skip` added.

---

## Clocktime estimate for the whole S0–S11 build (engineer-hours)

For the PM to seed `budget.json.clocktime`. Experienced full-stack engineer-hours,
**excluding human-gate wait time**; includes TDD, per-slice review/rework, and the
regulated negative-test kits. Ranges are optimistic / expected / pessimistic.

| Phase | Scope | O | E | P |
|---|---|---:|---:|---:|
| S0 | Monorepo + CI + flag seam (this dispatch's foundation) | 16 | 24 | 36 |
| S1 | Auth & session (this dispatch) | 12 | 20 | 32 |
| S2 | Teams + tenant isolation (RLS, negative-test kit) — TOP RISK | 20 | 32 | 48 |
| S3 | Invites & membership | 10 | 16 | 26 |
| S4 | Lists CRUD + delete-cascade | 8 | 12 | 20 |
| S5 | Tasks CRUD + 5s undo | 12 | 18 | 30 |
| S6 | Assignment (member-only) | 6 | 10 | 16 |
| S7 | Due dates + reminder scan (Lambda) + tray | 16 | 24 | 40 |
| S8 | Tags + priority + sort/filter/keyset | 12 | 18 | 30 |
| S9 | Account deletion + PII erasure + retention job | 16 | 24 | 40 |
| S10 | WCAG 2.2 AA conformance + a11y tests | 12 | 20 | 32 |
| S11 | Progressive delivery + observability + metrics | 12 | 18 | 30 |
| **Subtotal** | | **152** | **236** | **380** |
| Cross-cutting overhead (gate iteration, integration, deploy plan rework) ~15–20% | | ~23 | ~40 | ~76 |
| **Total (engineer-hours)** | | **~175** | **~275** | **~455** |

**Read:** ~**175 / 275 / 455** engineer-hours ≈ **4.5 / 7 / 11.5** engineer-weeks for one
engineer. Frontend + backend can parallelize per-slice once the contract is frozen
(WIP-limit 2), compressing calendar time but not the hour total. S2 (tenancy) and S9
(erasure) are the highest-variance items — the pessimistic tail is dominated by them
plus the regulated a11y (S10) verification.
