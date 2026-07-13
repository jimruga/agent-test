# ADR-0005 — Runtime baseline: Node 26.x + npm 12.0.1

- **Status:** Proposed (software-engineer; pending Gate 5 review by architect + reviewer)
- **Context:** Team To-Do App (MVP). Toolchain-only version bump; no application logic changes.
- **Relates to:** ADR-0004 (monorepo bootstrap & tooling — deferred this bump).

## Context / problem

CLAUDE.md's stack line targets **Node ~26 / npm ~12**, but the monorepo was
bootstrapped on Node 20 / npm 10.9.3. ADR-0004 deliberately used currently
installable pins so CI could resolve and build, and flagged the aspirational
CLAUDE.md pins as "a deliberate future bump, not a silent divergence" to be
scheduled by the architect/PM. This ADR executes that scheduled bump for the
**runtime toolchain only** (Node + npm), closing the divergence between the
declared stack and the actual runtime. Dependency versions (vite, vitest,
typescript, Fastify, Knex, React) are intentionally left unchanged here.

## Decision

Adopt **Node 26.x** as the monorepo runtime baseline with **npm 12.0.1** (latest
stable npm 12). Applied across:

- root `package.json` — `engines.node` `>=26 <27`, `engines.npm` `>=12 <13`,
  `packageManager` `npm@12.0.1`
- `.nvmrc` → `26`
- `apps/api/package.json` — `@types/node` `~26.0.0`
- `.github/workflows/ci.yml` (`verify`, `migrations`, `integration`, `sca`) and
  `.github/workflows/regen-lockfile.yml` — `node-version: "26"`, `npm@12.0.1`

## Consequences

(a) **Node 26 is pre-LTS until 2026-10-28.** Dev/CI upgrade now; the PM has
accepted pre-LTS for dev/CI. The **production deploy (Gate 6) must confirm Node 26
has reached Active-LTS status** before going to production — this check is a
required item in the Gate 6 deploy plan.

(b) **npm/cli#4828 (darwin/linux lockfile drift) remains unresolved in npm 12.**
The `lockfile-guard` CI job and the `regen-lockfile` workflow must stay in place;
their mechanism is unchanged, only the pinned version strings were updated to
match (npm 12.0.1 / node:26). The lockfile is still generated on linux and the
guard still hard-fails if the linux-x64 native deps are missing or `@rolldown/binding`
appears.

(c) **npm 12 turns install-scripts off by default.** This is safe for this
toolchain: the native binaries we depend on (biome, esbuild, rollup) ship as
**per-platform `optionalDependencies`**, not `postinstall` scripts, so the
new default does not break installs.

(d) **tsx 4.19 on Node 26** exercises Node's module-customization hooks API, which
has churned across Node majors. A **tsx smoke-test on Node 26 is required before
Gate 6** (dev/watch, migrate:up/down via `NODE_OPTIONS="--import tsx"`).

(e) **All other declared deps verified Node 26 compatible; no dependency upgrades
in this change.** vite stays pinned at **5.4.x** (esbuild/rollup, no rolldown) so
the cross-platform lockfile story and `lockfile-guard` continue to hold. Bumping
vite past 5.x is explicitly out of scope and would require re-solving the
cross-platform lockfile.

## Follow-ups

- Human/CI regenerates the committed `package-lock.json` on linux with npm 12.0.1
  (cannot be produced in the Claude sandbox — no registry network). See
  `workspace/ci-toolchain-fix.md`.
- Gate 6 deploy plan: (1) confirm Node 26 Active-LTS; (2) run the tsx-on-Node-26
  smoke test.
