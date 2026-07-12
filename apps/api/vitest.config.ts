import { defineConfig } from 'vitest/config'

// Coverage thresholds are enforced by the runner itself, so "tests pass" == "code
// covered" (verify.sh relies on this — a passing run is a covered run). Excludes
// the thin server entry (index.ts) and pure type modules, which carry no branches.
export default defineConfig({
  test: {
    environment: 'node',
    // Unit lane only. Integration tests use the `*.itest.ts` suffix and run in the
    // separate DB-backed lane (vitest.integration.config.ts), so this glob does not
    // match them and `verify.sh` stays hermetic (ADR-0004 no-DB lane).
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.itest.ts', // integration-lane tests (not source; not unit-covered)
        'src/index.ts', // composition root — wiring only, no branches
        'src/deps.ts', // interfaces only (no executable code)
        'src/auth/index.ts', // barrel re-exports
        'src/**/*.types.ts',
        'src/testing/**',
        // Integration-lane adapters (need a live Redis/Postgres); covered by the
        // migration/integration lane, not the unit `verify` lane.
        'src/**/*.knex.ts',
        'knexfile.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
