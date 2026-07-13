import { defineConfig } from 'vitest/config'

// Integration lane. Exercises the PRODUCTION adapters (KnexUserRepository, and
// later the ioredis session store) against REAL backing services — CI's
// postgres:16 (and, when added, Redis). Deliberately SEPARATE from the unit
// `verify` lane (vitest.config.ts) so `verify.sh` stays hermetic and fast with no
// DB/Redis (ADR-0004 no-DB lane). Run via `npm run test:integration` from a CI
// job that provisions the service and applies migrations first.
//
// Test files use the `*.itest.ts` suffix so they are invisible to the unit lane's
// `src/**/*.test.ts` glob. No coverage thresholds here — coverage is owned by the
// unit lane; this lane proves the SQL actually works against a real engine.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.itest.ts'],
    // Real DB writes are stateful (shared schema, truncate-per-test) — serialize
    // files to avoid cross-test races on the single ephemeral database.
    fileParallelism: false,
  },
})
