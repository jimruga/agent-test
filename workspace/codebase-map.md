# Codebase Map — agent-test (Team To-Do App platform)

> Produced by the architect and kept current. Orients every fresh-context subagent
> (linked from `workspace/index.md`). Last refreshed: 2026-07-09, architecture phase
> of the Team To-Do App (MVP), pre-Gate-3.

## TL;DR — read this first

**This repo has no application code yet.** The physical tree is (a) the
**agent-operations scaffold** (governance, compliance, reliability, workspace,
`.claude/`) and (b) a **prescribed monorepo convention corpus** in `.claude/rules/*`
and `.claude/CLAUDE.md` that describes the *target* app architecture. The
`apps/web`, `apps/api`, `packages/shared`, `eb-worker`, `localstack`, `docs/`, and
`openapi.yaml` referenced throughout the rules **do not exist on disk** — they are
the paved road the first feature must lay down.

So this is a **hybrid, not a classic brownfield**: the *conventions* are
brownfield (fixed, non-negotiable, must be followed exactly), the *code* is
greenfield. The dominant architectural risk is therefore **convention drift** —
the first feature sets every precedent, and a fresh-context subagent that invents a
greenfield pattern instead of following the rules corpus creates debt on day one.
The Team To-Do App is that first feature.

## Architecture overview (target — from the convention corpus)

A Turborepo/npm-workspaces monorepo. A React 19 + Vite SPA (`apps/web`) talks to a
Hono HTTP API (`apps/api`) over REST. The API is **contract-first**:
`apps/api/openapi.yaml` (OpenAPI 3.1) is the single source of truth, and the web
client under `apps/web/src/client/` is **generated** from it (`make claude-gen-client`)
— never hand-written. Shared types cross the boundary via `packages/shared`.
Persistence is AWS RDS PostgreSQL accessed through Knex. Async/deferred work runs
in `eb-worker/` (an Elastic Beanstalk worker that polls SQS and writes Postgres),
which lives **outside** the workspace globs with its own image/lockfile.

> Note: `apps/api` conventions say Hono; `.claude/CLAUDE.md` stack line and the PRD
> say Fastify. **This is an unresolved contradiction the TDD must settle** (see
> Coherence issues). Both are Node/TS REST servers; the contract-first + in-process
> `app.request()` test pattern in `api-conventions.md` is written for Hono.

Request flow (target): browser → CloudFront/edge + WAF → ALB → API server → Knex →
RDS. Auth is OAuth2 (authorization-code), tokens exchanged and held **server-side**
(never sent to the SPA). Deferred/scheduled work (e.g. reminder scans) is enqueued
to SQS and drained by the worker.

## Key modules / services (target)

| Module / service | Responsibility | Stack | Owner | Exists? |
|---|---|---|---|---|
| `apps/web` | React 19 + Vite SPA; feature-sliced UI | TS, TanStack Router/Query, shadcn, Tailwind v4 | frontend-engineer | No — to be created |
| `apps/api` | REST API, contract-first via `openapi.yaml` | TS, Hono (vs Fastify — unresolved), `tsx` | software-engineer | No — to be created |
| `packages/shared` | Framework-agnostic shared types/utils | TS | software-engineer | No — to be created |
| `apps/web/src/client` | **Generated** OpenAPI client | codegen (`@hey-api/openapi-ts`) | generated — never edit | No |
| `eb-worker` | SQS → Postgres async worker; own image/lockfile, outside workspace | TS, `tsx`, AWS SDK SQS, `pg` | software-engineer / devops | No |
| `localstack` | Local SQS emulator + queue init hook | Docker | devops | No |
| `migrations` (GitHub location) | Knex migrations | SQL/Knex | **data-engineer (owns)** | No |
| Agent scaffold | governance/compliance/reliability/workspace/`.claude` | Markdown/JSON/sh | fleet | **Yes — the only code present** |

## Data stores & integrations (target)

- **Primary DB:** AWS RDS PostgreSQL (Multi-AZ in prod), Knex query builder + migrations.
  DynamoDB only where an access pattern justifies it (none identified for this MVP).
- **Queue:** SQS (LocalStack locally) for deferred/scheduled work → `eb-worker`.
- **Cache/session:** Redis (ElastiCache) "where justified." Server-side OAuth2
  session/token storage is a likely first justification (see Coherence guidance).
- **Secrets/keys:** AWS Secrets Manager / SSM SecureString; KMS for encryption.
  **Never in git** — `.gitignore` + `.gitleaks.toml` + pre-commit are the backstop;
  workloads read at runtime via IAM. Handle ARNs/references, never values.
- **External:** OAuth2 identity provider(s) (e.g. Google). Monitoring SaaS
  (Datadog/Sentry/Logz.io/Heap) billed outside AWS.

## Conventions (the real ones — non-negotiable, from `.claude/rules/*` + CLAUDE.md)

Follow these exactly; do not invent greenfield alternatives.

- **Named exports only** — no default exports anywhere; route files export a named `Route`.
- **Feature isolation** — `apps/web/src/features/<name>/` is the unit of work; import
  a feature only through its `index.ts` barrel, never `features/foo/internal/...`.
- **Contract-first** — edit `apps/api/openapi.yaml`, then `make claude-gen-client`.
  **Never hand-edit generated code** (`apps/web/src/client/**`, `routeTree.gen.ts`);
  a hook blocks it. App code consumes the client via the `@/lib/api` shim, never
  `@/client/@tanstack/...` directly.
- **API layer** — Hono `app` instance exported and served separately so tests run
  in-process via `app.request('/api/...')`; routes mount under `/api`; ESM
  extensionless imports; new endpoints need a happy-path **and** a failure/validation
  test. (See `api-conventions.md`, `add-endpoint` skill.)
- **State homes (web)** — route/search params → TanStack Router (or nuqs for complex,
  URL-round-tripping search/filter/sort); forms → React Hook Form + zodResolver;
  server cache → TanStack Query via the shim; global client state → Zustand,
  sparingly. **Do not add new state libraries.**
- **Styling** — Tailwind v4 CSS-first via `@theme` in `apps/web/src/styles/app.css`;
  **no `tailwind.config.js`**; shadcn primitives in `components/ui/` are owned code
  (extend in place, add via `shadcn-add`, don't hand-copy); brand tokens overridable
  per `[data-theme]` (ADR-0001, see debt below).
- **Routing** — file-based TanStack Router; a new route is a new file; run `make claude-routes`.
- **No PII validation of first-party responses with Zod** — trust generated types + contract tests.
- **Verification** — work is done when `./verify.sh` / `make claude-check` is green
  (lint + typecheck + test + coverage + anti-tamper). CI is the binding gate;
  **no test tampering** (no delete/`.skip`/`.only` to force green). Claude Code uses
  the `make claude-*` targets (plain `npm run` hits `spawn EPERM` in the sandbox).
- **Migrations** — authored by the **data-engineer** to the `migrations` location,
  reviewed in the **same PR** as the code that depends on them.
- **Secrets** — AWS key store only; references/ARNs in code, never values.
- **Don't reference gitignored files** from checked-in code/docs.

## Health assessment

Framed for a governed scaffold with no app code yet — the "health" concerns are
about the starting conditions the first feature inherits, not existing app debt.

- **Test coverage state:** No app code, so **no coverage anywhere**. `verify.sh`
  enforces coverage in CI; the first feature must stand up the test harness (Vitest
  unit + `app.request` API tests + Playwright e2e + axe-core a11y). No characterization
  tests are needed (nothing to preserve — this is greenfield code).
- **Tech-debt / risk hotspots (starting conditions, ranked):**
  1. **Hono-vs-Fastify contradiction** (highest) — `api-conventions.md` says Hono;
     CLAUDE.md stack + PRD say Fastify. The contract-first, in-process test pattern
     is written for Hono. Must be resolved in the TDD before any API code is written.
  2. **Convention drift** — fresh-context subagents may build greenfield instead of
     following the rules corpus. Mitigation: this map + the rules; architect reviews
     the TDD for coherence.
  3. **Missing paved-road scaffolding** — no `package.json`, `npm-workspace.yaml`,
     `turbo.json`, `openapi.yaml`, or `docs/adr/` exist. Bootstrapping these is part
     of feature 1 and sets platform-wide precedent. Note: adding under `apps/*`
     forces a lockfile change that **cannot be regenerated in the Claude sandbox**
     (no npm-registry network) — plan the initial scaffold + lockfile as a step a
     human/CI runs.
- **Dead code / unused paths:** `.claude/rules/state-management.md` references
  `apps/web/src/features/interventions/draftStore.ts` and a "BOM table" feature that
  **do not exist here** — these conventions were lifted from a different Fictiv
  codebase. Treat them as *pattern guidance*, not as extant code to import. Same for
  the referenced `feature-slice`, `shadcn-add`, `add-endpoint`, `i18n-add-string`
  skills (named in CLAUDE.md but not present under `.claude/skills/`).
- **Dependency & security debt:** No dependency manifest yet, so nothing to scan.
  The stack pins are aspirational/near-future (Node ~26.5, npm ~12, TS ~7, React
  ~19.2, Fastify ~5.10, Knex ~3.3). CI `sca`/SBOM jobs referenced in CLAUDE.md must
  exist before Gate 5. `.gitleaks.toml` + `.pre-commit-config.yaml` are present.
- **Coherence issues (dangling references — debt to close):**
  - **ADR-0001 (brand theming)** is cited by `web-conventions.md` but `docs/adr/`
    does not exist. Either ADR-0001 must be authored when the web app lands, or the
    reference is corrected. Recorded as a debt item; this feature's ADR is numbered
    **ADR-0002** to avoid colliding with the referenced-but-absent ADR-0001.
  - Storybook (`storybook.md`) and i18n (`i18n.md`) conventions exist but no host
    app — they apply once `apps/web` is scaffolded.

## Prioritized refactor backlog

There is no legacy code to refactor. The backlog below is **platform-foundation
work** (bootstrap + coherence), not behavior-preserving refactors, so the
`legacy-refactoring` skill / characterization-test discipline does **not** apply
(nothing to preserve). Items are tiered by blast radius for gating.

| # | Area | Problem | Risk if untouched | Effort | Tier | Notes |
|---|---|---|---|---|---|---|
| 1 | API framework | Hono vs Fastify contradiction | Two engineers build against different frameworks | S | High | **Resolve in the TDD before Gate 3.** Recommend following `api-conventions.md` (Hono, contract-first, in-process tests) and correcting the CLAUDE.md stack line — or the reverse — but pick one. |
| 2 | Monorepo bootstrap | No `package.json`/workspace/`turbo.json`/`openapi.yaml`/`docs/adr` | Nothing builds; lockfile can't regen in sandbox | M | High | First feature lays the paved road; human/CI runs the initial lockfile install. |
| 3 | ADR-0001 | Referenced by web-conventions, file absent | Dangling doc reference; brand-theming rationale unrecorded | S | Low | Author ADR-0001 when `apps/web` lands, or fix the reference. |
| 4 | Convention corpus vs reality | Rules cite features/skills that don't exist here | Subagents import phantom code | S | Low | This map is the corrective; keep it current. |

---

*Refactor items that touch real code later are behavior-preserving (see
`legacy-refactoring`) and enter the normal flow tiered by blast radius. The items
above are greenfield foundation work and are tiered only for gate selection.*
