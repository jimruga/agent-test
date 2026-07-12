# ADR-0004 — Monorepo bootstrap: npm workspaces, verify scope, and the no-DB test lane

- **Status:** Proposed (software-engineer; pending Gate 5 review by architect + reviewer)
- **Context:** Team To-Do App (MVP), S0.1 foundation. First service — sets platform precedent.
- **Relates to:** ADR-0002 (compute), ADR-0003 (Fastify). codebase-map backlog #2 (bootstrap).

## Context / problem

Standing up the monorepo surfaced three contradictions in the convention corpus
that the first service must resolve rather than inherit:

1. **Package manager.** CLAUDE.md's stack line says **npm ~12**, but the old
   `Makefile` used pnpm-isms (`npm --filter`, `npm-workspace.yaml`) and referenced
   per-workspace `node_modules/.bin` paths. `.github/workflows/ci.yml` uses
   `npm ci`. Mixed signals.
2. **verify.sh scope.** `verify.sh` scanned top-level `ux/ api/ application/`
   directories (the "separate repos / top-level dirs" model from CLAUDE.md's
   systems-of-record section), which do **not** match the `apps/* + packages/*`
   workspace described by `monorepo-layout.md` and the `Makefile`. As written it
   would verify *nothing* in the monorepo.
3. **Version pins.** CLAUDE.md pins (TS ~7.0.2, Fastify ~5.10, React ~19.2.7,
   Knex ~3.3) are noted in the codebase-map as **aspirational/near-future**; some
   are not installable as pinned today.

## Decisions

1. **npm workspaces** (standard `workspaces` array in the root `package.json`,
   members `apps/*` + `packages/*`), one root lockfile. Aligns with the CLAUDE.md
   npm stack line and CI's `npm ci`. The `Makefile` `claude-*` targets were fixed
   to invoke hoisted `node_modules/.bin` binaries directly (sandbox-safe), and the
   standard targets to use `npm run`.
2. **verify.sh verifies the monorepo**: detect the root `workspaces` package.json,
   run `npm ci` → `npm run typecheck` → `npm run lint` → `npm test` (coverage
   thresholds enforced by the vitest runner). **The anti-tamper diff check is
   unchanged** — it remains the load-bearing anti-gaming control. CI's `sca` and
   `migrations` jobs were repointed at the single root lockfile / the
   `@repo/api` migrate scripts.
3. **Installable version pins now, aspirational pins tracked.** Used currently
   installable versions (TS ~5.6, Fastify ~5.1, React ~19.0, Knex ~3.1, Vite ~5.4)
   so CI can actually resolve and build. The aspirational CLAUDE.md pins are a
   deliberate future bump, not a silent divergence — flagged to the architect/PM to
   either update CLAUDE.md or schedule the upgrade.

## Consequence that shapes all API code: the no-DB unit lane

CI's `verify` job has **no Postgres/Redis** (only the separate `migrations` job has
Postgres). Therefore the API is built **dependency-inverted**: `buildApp(deps)`
depends on interfaces (OAuth provider, session store, user repository, feature
flags, config), and tests inject **in-memory fakes** and drive the app in-process
via `app.inject()`. Integration-only adapters (`*.knex.ts`, the ioredis wiring in
`index.ts`) are excluded from unit coverage and exercised by the migration/
integration/deploy lanes. This keeps `verify` fast and hermetic **and** yields the
right architecture (the scoped/tenant repository in S2 slots in behind the same
interface). This pattern is the precedent for every later service.

## Alternatives considered

- **pnpm** — rejected to match the CLAUDE.md npm stack line and CI; revisit
  platform-wide via its own ADR if workspace ergonomics warrant it.
- **Testcontainers/live Postgres in the unit lane** — rejected: slower, flakier,
  and unnecessary when the repository interface can be faked; DB correctness is
  proven by the dedicated migration apply/rollback lane instead.

## Follow-ups (before Gate 5)

- Human/CI runs the first `npm install` to generate the committed lockfile (cannot
  be produced in the Claude sandbox — no registry network).
- Architect/PM: reconcile CLAUDE.md version pins vs installed, and the CLAUDE.md
  "component locations" wording vs the `apps/*`/`packages/*` monorepo reality.
