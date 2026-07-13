import { defineConfig } from '@hey-api/openapi-ts'

// Contract-first: the web client under src/client/ is GENERATED from the API's
// openapi.yaml (`make claude-gen-client`) and is NEVER hand-edited (a hook blocks
// it). App code consumes it via the @/lib/api shim, not deep client paths.
//
// Config API pinned to @hey-api/openapi-ts 0.53.x (Node-20 compatible). 0.53.x
// uses the top-level `client` string; the `plugins: [...]` array is the 0.54+/0.99
// API and would throw on 0.53.x. If the tool is ever bumped, this must move back to
// `plugins` in the SAME change set as the bump + `make claude-gen-client` (see
// generated-boundary.md: codegen tool + generated client are one pinned unit).
export default defineConfig({
  input: '../api/openapi.yaml',
  output: { path: 'src/client', format: 'biome' },
  client: '@hey-api/client-fetch',
})
