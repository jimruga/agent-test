import { defineConfig } from '@hey-api/openapi-ts'

// Contract-first: the web client under src/client/ is GENERATED from the API's
// openapi.yaml (`make claude-gen-client`) and is NEVER hand-edited (a hook blocks
// it). App code consumes it via the @/lib/api shim, not deep client paths.
export default defineConfig({
  input: '../api/openapi.yaml',
  output: { path: 'src/client', format: 'biome' },
  plugins: ['@hey-api/client-fetch'],
})
