import type { Knex } from 'knex'

// S1 (auth & session) migration 1/5. Enables the Postgres extensions the
// auth-table shapes depend on: `citext` for case-insensitive email matching
// (users.email, invites.email later) and `pgcrypto` as its prerequisite on
// most Postgres builds. IDs are UUIDv7, generated app-side (see
// user-repository.knex.ts `generateId`), so `gen_random_uuid()` is
// deliberately NOT relied on for row defaults — no DB-side PK default is
// declared in the tables that follow.
//
// data-plan: workspace/data-plan-todo-app.md §1.1

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto')
  await knex.raw('CREATE EXTENSION IF NOT EXISTS citext')
}

export async function down(knex: Knex): Promise<void> {
  // Safe at this point in the CI apply+rollback lane: this is the first
  // migration, so nothing yet depends on these extensions. Once later
  // migrations (citext columns) exist, `down` here would need to run after
  // theirs — respected by rollback-all running in reverse migration order.
  await knex.raw('DROP EXTENSION IF EXISTS citext')
  await knex.raw('DROP EXTENSION IF EXISTS pgcrypto')
}
