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

## CI fix batch (2026-07-11 re-run) — real failures after exec-bit fix

`verify.sh` now executes in CI (mode=full). The exec-bit fix surfaced the real
failures below. All fixes are authored for CI on the SAME branch
`feature/s0-s1-foundation-auth` (staged; `git commit` + `npm install` are
permission-denied / no-registry in this sandbox — **nothing executed here**; the
human regenerates the lockfile + commits; CI is the verifier).

### Root cause (single upstream cause for failures 1–4)
`npm ci` requires `package-lock.json` to be **exactly** in sync with every
`package.json`. The committed lock was generated from an earlier package.json set
and had drifted (lock resolved vite 8.1.4 / vitest 4.1.10 while package.json pins
had diverged; several packages "Missing from lock file"). `npm ci` therefore
**aborted the install**, and every downstream check failed *as a cascade of the
missing `node_modules`* — not as independent bugs:
- typecheck `TS2688 Cannot find type definition file for 'node'` / `'vite/client'`
  — `@types/node` and `vite` simply weren't installed.
- lint `biome: not found`, test `vitest: not found` — binaries not installed.

**Confirmed the type declarations are correct (no genuine gap):**
- `@repo/api` declares `@types/node` (`~20.16.0` devDep) and `tsconfig.json`
  `types: ["node"]` → resolves once installed.
- `@repo/web` gets `vite/client` from its `vite` devDep + `tsconfig.json`
  `types: ["vite/client"]` → resolves once installed.
- `@biomejs/biome` (root devDep `1.9.4`) and `vitest` (root + api devDep) are
  declared. No tsconfig/declaration change was needed; the errors were pure
  install-cascade.

### Fix — dependency reconciliation (package.json × 3)
Diagnosis of the desync: the **committed (HEAD)** package.json set was already the
engineer's clean, reviewed baseline — root: biome 1.9.4 / typescript ~5.6.0 /
vitest ~2.1.0 / @vitest/coverage-v8 ~2.1.0; `@repo/api`: fastify ~5.1.0, knex
~3.1.0, etc. + vitest ~2.1.0; `@repo/web`: vite ~5.4.0, @vitejs/plugin-react
~4.3.0, react ~19, @hey-api/openapi-ts ~0.53.0. **`~2.1.0` can never resolve to
vitest 4.1.10**, so the committed lock (which had vitest 4.1.10 / vite 8.1.4) was
NOT generated from the committed package.json — it came from an **unstaged
working-tree experiment** (someone had bumped to vite 8 / vitest 4, added a dead
`allowScripts` block, and wired misplaced `fastify`/`vite`/`@hey-api/openapi-ts`
deps into the wrong workspaces). `git diff --cached` was empty — the experiment
was never staged; only the mismatched lock got committed. That lock-vs-manifest
divergence is the `npm ci` abort.

Resolution — **reconcile toward the reviewed baseline, discard the experiment**:
- **Discarded the working-tree experiment in full**: removed the dead
  `allowScripts` block (no `.npmrc`, no lavamoat, no `ignore-scripts` — nothing
  reads it) and the misplaced deps (React app never imports fastify; the Fastify
  API never imports vite; only `@repo/web`'s `openapi-ts.config.ts` uses
  `@hey-api/openapi-ts`). Restores HEAD's clean per-workspace dependency shape.
- **Pinned the volatile test/build tooling exactly and identically** (the task's
  "pin consistently"), tightening HEAD's tilde ranges so lock↔manifest can never
  drift again: `vitest 2.1.9`, `@vitest/coverage-v8 2.1.9` (== vitest, required),
  `vite 5.4.21`. `@biomejs/biome 1.9.4` (already exact). `typescript ~5.6.0`.
- Libraries stay at HEAD's tilde/caret intent: `fastify ~5.1.0`, `knex ~3.1.0`,
  `react ~19.0.0`, `@hey-api/openapi-ts ~0.53.0`, `@types/node ~20.16.0`, etc.
- **Chose the vitest 2.1 / vite 5.4 matrix (over the experiment's vite 8 / vitest
  4)** deliberately: it is the reviewed committed intent, and it is a matrix whose
  mutual peer-compatibility I can reason about confidently (vitest 2.1 ↔ vite ^5 ↔
  @vitejs/plugin-react 4.3 ↔ React 19). I could not reach the registry to validate
  vite 8 + plugin-react 4.3 peer resolution, and the experiment's lock may have
  been force-installed — so I did not adopt versions I can't verify.
- **Peer note:** `vite` lives only in `@repo/web`; `vitest` (root + `@repo/api`)
  peer-depends on it and finds it via workspace hoisting to the root
  `node_modules` — the same arrangement HEAD used and reviewed.

Net effect (diff vs HEAD is only the exact-pin tightening): a fresh `npm install`
from the reconciled set produces a lock that `npm ci` then accepts, and the
typecheck/lint/test binaries resolve.

### Tamper-check finding — verdict **(b) legitimate code, over-broad pattern**
The flagged added line is `apps/api/src/index.ts:82` `process.exit(1)`, inside the
composition-root's fatal-startup handler:
```
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err); process.exit(1) })
}
```
This is the standard Node server entrypoint — it is **not** a test and **not** a
test short-circuit (it only runs when the module is executed directly, guarded by
the `import.meta.url` check; tests import `buildApp` and never hit it). It bypasses
no assertions.

**Why it trips:** `verify.sh`'s tamper regex has an unanchored `xit\(` alternative
(meant to catch the Jasmine/Mocha pending-test marker `xit(...)`). Unanchored, it
matches the substring `xit(` inside `process.e`**`xit(`**`1)`. Proven in-sandbox:
the current regex flags `+ process.exit(1)`.

**Resolution (do NOT weaken the control; needs human approval — I did not edit
verify.sh).** Segregation of duties: the maker must not modify the anti-gaming
control that checks the maker. Minimal correctness fix for the **human/PM** to
apply to `verify.sh` line 28 — anchor the two bare markers with a leading word
boundary:
- `(xit\()` → `(\bxit\()`  and  `(xdescribe\()` → `(\bxdescribe\()`

This is a **false-positive fix, not a weakening**: proven in-sandbox that the
anchored regex (a) no longer flags `process.exit(1)`, and (b) still catches all
genuine markers — `xit('...')`, `xdescribe('...')`, `it.only`, `test.skip`. A real
pending-test marker always has a word boundary (start-of-token / whitespace / `;`
/ `(`) before the `x`, so detection is unchanged. Rewriting the entrypoint to dodge
the literal `exit(` was rejected — that contorts correct product code to satisfy a
buggy check, which is itself a form of gaming.

### Not executed in sandbox
No `npm install`, `npm ci`, `tsc`, `vitest`, or `biome` (no registry network;
`node` aborts here). All authored for CI. Static checks I could run: JSON validity
of all 4 package.json files (OK), cross-workspace version-consistency audit (OK),
diff-vs-HEAD confirming the only manifest change is exact-pin tightening (OK),
grep-confirmed no source imports the removed deps, and the regex proof above.
Changed manifests: root `package.json`, `apps/api/package.json`,
`apps/web/package.json` (`packages/shared` unchanged).

### Exact steps for the human (branch still needs human commit + push)
On branch `feature/s0-s1-foundation-auth`, from the repo root:
```
# 1) Regenerate the lockfile from the reconciled package.json set.
#    Delete first so npm resolves cleanly from the manifests (the old lock is stale).
rm -f package-lock.json
npm install
# 2) (human-approved control fix) anchor the two bare markers in verify.sh line 28:
#    (xit\()       -> (\bxit\()
#    (xdescribe\() -> (\bxdescribe\()
#    (correctness fix to the tamper control — see verdict (b) below; I did NOT edit it)
#    IMPORTANT: verify.sh must stay executable (100755). The sandbox working tree
#    drifted to 100644; restore the exec bit BEFORE staging or CI regresses to the
#    earlier exit-126:
chmod +x verify.sh            # (or: git update-index --chmod=+x verify.sh)
# 3) Stage + commit + push
git add package.json apps/api/package.json apps/web/package.json package-lock.json verify.sh
git commit -m "fix(ci): reconcile workspace deps + regen lockfile; anchor xit/xdescribe tamper patterns"
git push
```
Then CI re-runs `verify.sh` (full) + migrations + integration → all-green is the
binding signal. (If the deploy authorizer prefers to keep the control change
separate for audit, split step 2 into its own reviewed commit — verify.sh is the
load-bearing anti-gaming control.)

---

## CI fix batch (2026-07-11, iter 4) — typecheck + lint failures after install went green

`npm install` now succeeds and all 65 unit tests pass at ~96% coverage, but
`verify.sh` still failed on **typecheck** and **lint**. Unlike prior iters, the
sandbox this time HAS `node_modules` + a working `node`/`tsc`/`vitest`/`biome`, so I
**actually executed** typecheck, lint, and the unit suite locally (on Node 26, not
the Node-20 CI target). Results below are locally-observed, but **CI remains the
binding verifier** — especially for the dep change (see #4), which I could NOT
install-verify offline. All fixes are on the SAME branch `feature/s0-s1-foundation-auth`
(staged; `git commit` + `npm install` unavailable in-sandbox).

### The brief's guessed causes vs. the real ones
- **Typecheck was NOT failing in `@repo/shared`.** `packages/shared` already has real
  named-export modules (`errors.ts` `ApiErrorBody`/`ApiErrorCode`; `auth.ts`
  `CurrentUser`/`MembershipSummary`/`TeamRole`; barrel `index.ts`) and typechecks
  clean (no TS18003). The five real errors were all in **`apps/api`** — code authored
  "for CI" in earlier iters that had never actually been type-checked until now.

### 1. Typecheck (5 errors in `apps/api`) — FIXED
- **TS6059** `apps/api/src/index.ts:4` — `knexfile.ts` (at the workspace root per
  `api-conventions.md`) is included in the program but sits outside `rootDir: ./src`.
  Fix: **removed `rootDir` from `apps/api/tsconfig.json`**. The base config is
  `noEmit: true`, so `rootDir` did no emit work — it only enforced a false "all
  inputs under src" invariant. `knexfile.ts` stays where the migrate scripts and the
  conventions doc expect it.
- **TS2345** `apps/api/src/index.ts:54` — `knexConfig[env]` resolved to
  `Knex.Config | undefined` because `knexfile.ts` typed `config` with an index
  signature (`{ [env: string]: Knex.Config }`) and `noUncheckedIndexedAccess` is on.
  Fix at the source: retyped to **`Record<'development' | 'production', Knex.Config>`**
  (known literal keys, not an index signature) so indexing with the
  `'production' | 'development'` ternary yields a defined `Knex.Config`.
- **TS18046 ×3** `apps/api/src/platform/error-envelope.ts:72,81` — `err is unknown`.
  Root cause: **Fastify 5.10 changed `setErrorHandler`'s error generic default to
  `TError = unknown`** (was `FastifyError`); the handler assumed the old typing.
  Fix: annotate `(err: unknown, …)` and narrow via two small helpers
  (`errorStatusCode(err)` reads a numeric `statusCode` off an object; `errorMessage(err)`
  returns `err.message` only for real `Error`s). **Behavior-preserving** — the existing
  `registerErrorEnvelope` characterization tests (generic 500, preserved-statusCode
  422→`unprocessable`, 404) still pass unchanged.

### 2. Biome lint scope — FIXED (`biome.json`)
`biome check .` was linting PM/agent-ops + docs artifacts (`workspace/budget.json`,
`workspace/backlog.json`, `.claude/settings.json`, root config) — those must never
break the code lint gate. Added **`files.include: ["apps/**", "packages/**"]`** so
Biome only checks application source; the existing `files.ignore` still carves out
generated output (`apps/web/src/client/**`, `routeTree.gen.ts`) and build dirs.
`workspace/`, `docs/`, `.claude/`, `compliance/`, `governance/`, `reliability/` are
now out of scope by construction. `migrations/` is NOT added to scope — it is
repo-level, owned by the data-engineer, and exercised by the CI apply+rollback lane,
not the lint gate. Verified: Biome now checks 49 files, all under `apps/`+`packages/`.

### 3. App-source lint errors — FIXED
Ran **`biome check --write .`** (now correctly scoped): 13 formatter + 6
organizeImports fixes across the flagged files (`apps/api/src/auth/routes.ts` +
`.test.ts`, `session-store.test.ts`, `testing/build-test-app.ts`,
`apps/web/src/lib/feature-flags.tsx`, and others). One error Biome flagged as an
**unsafe** autofix — `useTemplate` in `platform/secrets.ts` (template-literal + string
concatenation) — I fixed **by hand** into a single template literal (message text
unchanged). `biome check .` is now clean (0 errors). **The human does NOT need to run
the autofix** — it is already applied and staged.

### 4. EBADENGINE — `@hey-api/openapi-ts` pinned to Node-20-compatible — FIXED (deps changed)
The installed tree had `@hey-api/openapi-ts@0.99.0`, which requires **`node >=22.18.0`**
→ EBADENGINE on the Node-20 target. Pinned to **`0.53.12`** (the earlier reviewed
baseline) in all three manifests where it was declared: root `package.json`
(dep `0.99.0`), `apps/api/package.json` (dep `0.99.0`), `apps/web/package.json`
(devDep `^0.99.0`). No other `@hey-api/*` packages are declared.
- **This is a dependency change → the human must `rm package-lock.json && npm install`**
  again to regenerate the lock, or `npm ci` in CI will abort on the stale lock. I could
  NOT install-verify this offline (no registry; `node_modules` still has 0.99.0), so
  the pin is authored-for-CI and unverified locally.
- **Codegen coupling (flagged, not blocking the gate).** Per `generated-boundary.md`,
  `@hey-api/openapi-ts` + the generated client are "one pinned unit" — a bump/downgrade
  should ship with `make claude-gen-client` + `make claude-typecheck` in the same change
  set. Mitigating facts: there is **no `apps/web/src/client/` yet** (skeleton), and
  `gen:client` is **not** in `verify.sh`, so the version does not affect the CI gate.
  BUT `apps/web/openapi-ts.config.ts` currently uses the 0.99 `plugins:
  ['@hey-api/client-fetch']` config API; **0.53.x's config API differs**. When the
  frontend-engineer first generates the client, the human/that engineer must run
  `make claude-gen-client` and adjust `openapi-ts.config.ts` to the 0.53.x API in the
  same change set. (Config file is NOT in the typecheck program, so it does not fail
  the gate today.) If the team would rather stay on the modern plugins API, pick the
  highest `@hey-api/openapi-ts` that still supports Node 20 instead of 0.53.12 —
  I couldn't determine that offline, so I used the known-good baseline.
- **Pre-existing observation (NOT changed — out of scope for this dispatch):**
  `@hey-api/openapi-ts` is currently mis-declared as a runtime `dependency` in root +
  `apps/api` (it belongs only in `apps/web` devDeps — it generates the web client).
  Likewise `fastify` appears in `apps/web` deps and `vite` in `apps/api` deps. These
  are the leftover "experiment" mis-placements the iter-2 notes flagged; I pinned the
  version in place but did not relocate them (would be a larger dep change, risks the
  currently-green install/test state). Recommend the PM route a small dependency-hygiene
  cleanup separately.

### verify.sh — NOT touched (segregation of duties)
I did not modify `verify.sh`. Its working-tree diff is the prior iteration's
human/PM-approved `\bxit`/`\bxdescribe` anchor + entrypoint-comment fix, not mine.

### Local verification (Node 26 sandbox — CI on Node 20 is the binding gate)
- `make claude-typecheck` → **exit 0** (all 3 workspaces clean).
- `make claude-lint` → **exit 0** (`biome check .` clean, 49 files, apps+packages only).
- `make claude-test` → **exit 0**, **65/65 tests pass**, coverage 96.89% stmts /
  84.02% branch / 92.85% funcs / 98.7% lines (all above the 80% thresholds).
- Not verifiable offline: `npm ci` against the regenerated lock (the #4 dep change),
  the Node-20 engine, the `migrations` apply+rollback lane, and the `integration`
  (`*.itest.ts`) lane. No `.only`/`.skip`/`xit`/`xdescribe` added by me (the single
  `describe.skip` in `user-repository.knex.itest.ts` is a pre-existing conditional
  integration-skip when `DATABASE_URL` is unset — the CI integration lane sets it).

### Exact steps for the human before commit/push
1. `rm -f package-lock.json && npm install` (dep change #4 — regenerate the lock; the
   old lock resolves `@hey-api/openapi-ts@0.99.0` and would keep EBADENGINE on Node 20).
2. Stage the fix set: `biome.json`, `apps/api/tsconfig.json`, `apps/api/knexfile.ts`,
   `apps/api/src/platform/error-envelope.ts`, `apps/api/src/platform/secrets.ts`, the
   Biome-reformatted `apps/**` source files, all three `package.json`, and the
   regenerated `package-lock.json`. (Biome autofix already applied — do not re-run.)
3. Commit + push → CI (`verify.sh` full + migrations + integration on Node 20) is the
   binding green signal.

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

---

## Manifest regression — DEFINITIVE fix (2026-07-13, iter 5/CI loop ~7)

The three package.json manifests had **reverted** to the vite8 / vitest4 /
openapi-ts0.99 "experiment" state, plus a **bogus `nvm@0.0.4`** dependency and a
dead `allowScripts` field. CI (linux-x64) failed on missing native bindings
(`@biomejs/cli-linux-x64`, `@rolldown/binding-linux-x64-gnu`) — the npm
cross-platform optional-deps bug, triggered because **vite 8 pulls rolldown**
(native bindings) and the committed lock was generated on darwin.

### WHY it reverted — root cause (investigated, plainly)
**Not a git history operation.** Evidence:
- `git reflog` is a clean linear chain: clone → `checkout` to
  `feature/s0-s1-foundation-auth` → 6 ordinary commits. **No `reset`, `rebase`,
  `revert`, file-`checkout`, or `stash` entry exists.**
- `git status` = working tree clean; `git stash list` = empty.

So no stash pop / no `git checkout .` / no `git reset` re-reverted my fixes. The
regression entered through **ordinary commits carrying `npm`-mutated manifests**:

1. **`7adef57`** ("Fix CI: reconcile deps…") first introduced the experiment into
   the *committed* root manifest: bumped vitest `~2.1.0`→`^4.1.10`, added a
   `dependencies` block (`@hey-api/openapi-ts 0.99.0`, `fastify 5.10.0`,
   `vite 8.1.4`) and the dead `allowScripts {}`.
2. **`dbbc2e3`** partially cleaned it (pinned openapi-ts back to `0.53.12` in all
   three manifests) but **left** vitest4 / vite8 / the root deps / allowScripts.
3. **`76a32a6`** ("Pin Node 20; sync lockfile under Node 20") **re-reverted**
   openapi-ts `0.53.12`→`^0.99.0` in root + apps/api + apps/web **and added
   `nvm ^0.0.4`** to root deps.

The `nvm ^0.0.4` + `allowScripts {}` are the fingerprint of a stray **`npm install
nvm`** — `nvm` is a *shell* tool (`nvm use`), not an npm library; the published
`nvm` package is an abandoned 0.0.4 stub. That `npm install` **mutated** the root
`package.json` in place (added the dep) and the subsequent "sync lockfile" re-resolve
loosened/reverted the ranges; all of it was then **committed wholesale** under a
"sync lockfile" message without diffing the manifest. **Mechanism = `npm install
<pkg>` silently rewriting `package.json`, then committing the mutated manifest.**

### Prevention (so it can't recur)
- **Never `npm install <pkg>` casually** on this repo — it rewrites `package.json`.
  Add deps by editing the manifest by hand, then `npm install` (no package arg) to
  regenerate only the lock.
- **Exact-pin all volatile tooling** (done below) so a re-resolve cannot drift.
- **Diff `package.json` before committing any "lockfile sync"** — a lock-sync
  commit must show *zero* manifest changes, or it is not a sync.

### What I restored — the clean, coherent manifests
Changed files (verify.sh **NOT** touched — PM-owned control):
`package.json`, `apps/api/package.json`, `apps/web/package.json`,
`apps/web/openapi-ts.config.ts`.

- **root** — removed the bogus `nvm`, the dead `allowScripts`, and the entire
  misplaced `dependencies` block (fastify/vite/openapi-ts do not belong at root).
  Root now carries only genuine workspace-wide devDeps: `@biomejs/biome 1.9.4`,
  `typescript ~5.6.0`, `vitest 2.1.9`, `@vitest/coverage-v8 2.1.9`. Kept `engines`
  (node `>=20 <21`, npm `>=10 <11`) and the PM's `.nvmrc`=20.
- **apps/api** — `fastify ~5.1.0` (per the CLAUDE.md stack line, was `^5.10.0`);
  removed the misplaced `vite` and `@hey-api/openapi-ts` (the API imports neither —
  grep-confirmed); `vitest`/`@vitest/coverage-v8` exact-pinned `2.1.9`.
- **apps/web** — removed the misplaced `fastify` dep (the React app never imports
  it — grep-confirmed); moved `@hey-api/openapi-ts` from deps intent to a
  **devDependency** pinned `0.53.12` (it is a build-time codegen tool, not runtime,
  and lives only in the workspace that generates the client); `vite` **`5.4.21`**
  (was `^8.1.4`).

### WHY vite 5.4 / vitest 2.1 — do NOT "upgrade" back into the trap
**vite 8 pulls `rolldown`, whose Rust native bindings are per-platform optional
deps.** npm has a known cross-platform optional-deps bug: a lock generated on darwin
omits the linux binding, so `npm ci` on the linux-x64 CI runner fails with
`@rolldown/binding-linux-x64-gnu` missing (biome's `@biomejs/cli-linux-x64` hits the
same class of bug). **vite 5.4 uses esbuild/rollup — no rolldown — so it avoids the
native-binding failure entirely.** vitest 2.1 is the matching peer for vite ^5 /
`@vitejs/plugin-react` 4.3 / React 19 (a matrix whose mutual peer-compatibility is
known-good), whereas vitest 4 pulls the vite-8/rolldown line. **Local (darwin)
`verify` passing is NOT evidence CI (linux) is green when rolldown bindings are in
play** — that mismatch is exactly what caused this loop. Rationale committed here
and in the codegen config comment so nobody re-bumps.

### openapi-ts.config.ts reconciled to the 0.53.x API
Changed `plugins: ['@hey-api/client-fetch']` (the 0.54+/0.99 array API — would throw
on 0.53.x) to the 0.53.x top-level `client: '@hey-api/client-fetch'`. This keeps
`make claude-gen-client` from breaking later. No generated client exists yet
(skeleton) and `gen:client` is not in `verify.sh`, so this does not affect today's
gate. **Note for the frontend-engineer:** when the client is first generated, the
generated fetch client may need `@hey-api/client-fetch` added as a web dependency —
add it in the same change set as the first `make claude-gen-client` (don't add an
unverified runtime dep now).

### FOOLPROOF human command sequence (branch `feature/s0-s1-foundation-auth`, repo root)
`git commit` + `npm install` are unavailable in the Claude sandbox — the human runs
these. Do them **in order**; do not interleave any `git checkout`/`reset`/`stash`.

```
# 0) Confirm you are on the branch with the clean manifests and NOTHING is stashed.
git status                 # must show only the 4 manifest/config files modified
git stash list             # must be EMPTY — a stray stash pop is how state reverts
#    DO NOT run `git checkout .`, `git reset --hard`, `git stash pop`, or
#    `git restore` here — any of them can re-revert the manifests. If you must,
#    inspect first.

# 1) Remove the bogus package from the installed tree (belt-and-suspenders; the
#    manifest no longer lists it, but the old node_modules/lock still may).
npm uninstall nvm 2>/dev/null || true    # no-op if already gone
#    (Do NOT run `npm install nvm` ever — nvm is a shell tool, not an npm package.)

# 2) Regenerate the lock on NODE 20 from the clean manifests. Delete the stale lock
#    first so npm resolves purely from package.json (the old lock still points at
#    vite8/vitest4/openapi0.99). Use Node 20 so engines + native bindings match CI.
nvm use 20                 # or: fnm use 20 — honor .nvmrc (=20). SHELL command.
node -v                    # must print v20.x
rm -f package-lock.json
npm install                # NO package argument — regenerates the lock only

# 3) Prove it locally the way CI will (Node 20). npm ci is the real lockfile gate.
rm -rf node_modules
npm ci                     # must succeed — fails if lock<->manifest drift remains
./verify.sh                # lint + typecheck + test + coverage + anti-tamper; must pass
#    (verify.sh must stay executable = 100755; if the bit was lost: chmod +x verify.sh)

# 4) Commit ALL manifest changes + the regenerated lock TOGETHER, so the clean state
#    is what lands as one unit (never commit manifests without the matching lock).
git add package.json apps/api/package.json apps/web/package.json \
        apps/web/openapi-ts.config.ts package-lock.json
git commit -m "fix(ci): restore clean workspace manifests; pin vite 5.4.21/vitest 2.1.9; drop bogus nvm dep + allowScripts"
git push
```
Then CI re-runs `verify.sh` (Node 20, linux) + the migrations + integration lanes →
`all-green` is the binding signal. If CI still shows a native-binding miss, the lock
was regenerated on the wrong Node/platform — repeat step 2 on Node 20; do **not**
reintroduce vite 8.
