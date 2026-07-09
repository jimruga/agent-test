---
paths:
  - "apps/api/**"
---

# API conventions (apps/api)

Hono 4 HTTP server, run under `tsx` (not compiled to JS). **Contract-first**:
`apps/api/openapi.yaml` (OpenAPI 3.1) is the source of truth from which the web
client is generated.

Layout:

```
apps/api/src/
├── app.ts        Hono app instance (exported), routes mounted under .basePath('/api')
├── index.ts      Node server entry (@hono/node-server) — reads PORT (default 3001)
└── *.test.ts     Vitest, exercised via app.request('/api/...')
```

- **The `app` instance is exported and served separately** so tests can exercise
  it in-process with `app.request('/api/...')` — no network/port needed. Follow
  this pattern: add routes to `app`, keep `index.ts` as the thin server entry.
- **Routes mount under the `/api` base path** to match the `servers` entry in
  `openapi.yaml`. Every path in the OpenAPI contract is relative to that base.
- **Contract sync is mandatory.** Any request/response shape a web client
  consumes must be defined in `openapi.yaml`. After editing the contract, run
  `make claude-gen-client` so `apps/web/src/client/` stays in step (see the
  `add-endpoint` skill for the full loop). Operational-only endpoints (like
  `/ping`) are intentionally **not** part of the contract.
- **ESM, extensionless imports** with bundler resolution (`import { app } from
  './app'`), running via `tsx watch` in dev. `build` is `tsc --noEmit` — this
  service is type-checked, not emitted.
- **Tests**: Vitest. New endpoints need a happy-path test plus at least one
  failure/validation-path test, all via `app.request(...)`.
- Shared types cross the app boundary via `packages/shared` (import as the
  workspace package), not by reaching into `apps/web`.
- Biome is the linter/formatter here too (single quotes, no semicolons, trailing
  commas). Run `make claude-lint` / `make claude-typecheck`.
