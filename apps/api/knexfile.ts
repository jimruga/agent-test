import type { Knex } from 'knex'

// Knex connection + migration config. Migration FILES are owned and authored by
// the DATA-ENGINEER into the repo-level `migrations/` location (TDD §3, data-plan)
// and land in the same PR as the code that depends on them. This file only points
// the runner at that directory. DATABASE_URL is supplied at runtime (CI provides
// an ephemeral Postgres for the apply+rollback gate); no credentials live here.
//
// The running API connects as the narrower `app_runtime` role (DML only, subject
// to FORCE ROW LEVEL SECURITY); migrations run as `app_migrator` (data-plan §2.4).
// Keyed by the known environments (not an index signature) so callers indexing
// with a literal env get `Knex.Config`, not `Knex.Config | undefined` under
// `noUncheckedIndexedAccess`.
const config: Record<'development' | 'production', Knex.Config> = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
    migrations: { directory: '../../migrations', extension: 'ts', loadExtensions: ['.ts'] },
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    // Warm, bounded pool for the EC2 long-running server (ADR-0002) — no RDS Proxy.
    pool: { min: 2, max: 10 },
    migrations: { directory: '../../migrations', extension: 'ts', loadExtensions: ['.ts'] },
  },
}

export default config
