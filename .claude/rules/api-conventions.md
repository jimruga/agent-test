---
paths:
  - "apps/api/**"
---

# API conventions (apps/api)

**Fastify 5** HTTP server (Node.js + TypeScript), run under `tsx` (not compiled to
JS). Framework ratified in **ADR-0003** (superseding the earlier Hono draft).
**Contract-first**: `apps/api/openapi.yaml` (OpenAPI 3.1) is the source of truth
from which the web client is generated.

Layout:

```
apps/api/
├── openapi.yaml         OpenAPI 3.1 contract (source of truth for the web client)
├── knexfile.ts          Knex config; migrations live in the repo-level migrations/
└── src/
    ├── app.ts           buildApp(deps) — the Fastify instance factory (exported)
    ├── index.ts         Node server entry (composition root) — reads PORT (default 3001)
    ├── deps.ts          AppDeps: the interfaces buildApp depends on (DI seam)
    ├── platform/        cross-cutting: error envelope, feature flags, secrets seam
    ├── auth/            feature module (barrel index.ts); routes + adapters
    ├── features/        flag-gated feature registration
    ├── testing/         in-memory fakes + buildTestApp (excluded from coverage)
    └── **/*.test.ts     Vitest, exercised in-process via app.inject(...)
```

- **`buildApp(deps)` returns the Fastify instance; it is served separately** in
  `index.ts` so tests exercise it in-process with `app.inject({ method, url })` —
  no network/port needed. Follow this pattern: add routes inside the app, keep
  `index.ts` as the thin server entry / composition root.
- **Dependency injection.** `buildApp` takes an `AppDeps` of interfaces
  (config, feature flags, OAuth provider, session store, user repository). Tests
  inject in-memory fakes (`src/testing/`), so the whole HTTP surface is testable
  with **no Redis/Postgres/OAuth network**. `index.ts` wires the real adapters.
- **Routes mount under the `/api` base path** (via a registered plugin with
  `{ prefix: '/api' }`) to match the `servers` entry in `openapi.yaml`. Every
  path in the contract is relative to that base. Operational endpoints (like
  `/ping`) are intentionally **not** in the contract and mount at the root.
- **Contract sync is mandatory.** Any request/response shape a web client
  consumes must be defined in `openapi.yaml`. After editing the contract, run
  `make claude-gen-client` so `apps/web/src/client/` stays in step. Never
  hand-edit generated code.
- **ESM, extensionless imports** with bundler resolution (`import { buildApp }
  from './app'`), running via `tsx watch` in dev. `build`/`typecheck` is
  `tsc --noEmit` — this service is type-checked, not emitted.
- **Error envelope.** Every non-2xx JSON response uses the shared `ApiErrorBody`
  shape (`platform/error-envelope.ts`). Never leak stack traces, SQL, or another
  tenant's data; cross-tenant reads return a 404-shaped body (TDD §4.4).
- **Tests**: Vitest. New endpoints need a happy-path test **plus** at least one
  failure/validation-path test, all via `app.inject(...)`. Coverage thresholds
  are enforced by the runner (a passing run is a covered run).
- Shared types cross the app boundary via `@repo/shared` (the workspace package),
  not by reaching into `apps/web`.
- **Persistence** goes through repository interfaces; the raw Knex handle is not
  exported from the data layer (this is where the scoped/tenant repository will
  enforce `team_id` in S2). Migrations are authored by the **data-engineer** to
  the repo-level `migrations/` and reviewed in the same PR as dependent code.
- **Secrets** are referenced by ARN and resolved at runtime (`platform/secrets.ts`)
  — never literals in code, env commits, or logs (secrets-management skill).
- Biome is the linter/formatter (single quotes, no semicolons, trailing commas).
  Run `make claude-lint` / `make claude-typecheck`.
