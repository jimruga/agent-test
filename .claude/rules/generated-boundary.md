---
paths:
  - "apps/web/src/client/**"
  - "**/routeTree.gen.ts"
  - "apps/api/openapi.yaml"
  - "apps/web/openapi-ts.config.ts"
  - "apps/web/tsconfig.client.json"
---

# Generated code boundary

These files are **generated — never hand-edit them.** A hook blocks edits to
`apps/web/src/client/**` and `routeTree.gen.ts`; regenerate instead.

- **`apps/web/src/client/`** is generated from `apps/api/openapi.yaml`. To change
  the client, edit `openapi.yaml`, then run `make claude-gen-client`. App code
  consumes the generated query/mutation helpers via the shim at
  `apps/web/src/lib/api/index.ts` (`@/lib/api`) — never import from
  `@/client/@tanstack/...` directly.
- **`routeTree.gen.ts`** is generated and committed so `make claude-typecheck`
  works before Vite runs. Regenerate with `make claude-routes`; don't hand-edit.
- **Generated client sub-project**: `apps/web` runs under
  `exactOptionalPropertyTypes: true`; `src/client/**` is carved into
  `apps/web/tsconfig.client.json` where the flag is relaxed. The `@/lib/api` shim
  bridges the two with `ExactOptionalize<T>`.
- **Codegen tool and generated client are one pinned unit.** Don't bump
  `@hey-api/openapi-ts` (or any codegen-input dep) without running
  `make claude-gen-client` and `make claude-typecheck` in the same change set.
- Don't runtime-validate first-party responses with Zod — trust the generated
  types and contract tests.
