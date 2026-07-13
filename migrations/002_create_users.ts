import type { Knex } from 'knex'

// S1 (auth & session) migration 2/5. `users` — a person (TDD §3.1).
//
// PII classification (data-plan §3.1):
//   email          -> Regulated PII, direct identifier. Encrypted at rest via
//                     KMS at the application/column level (this migration
//                     only declares shape; encryption is app/infra wiring,
//                     tracked separately for devops/security before Gate 6).
//   display_name   -> Regulated PII, direct identifier.
//   avatar_initials-> Internal (derived, low sensitivity, no external image).
//
// `id` is uuid PK with NO db-side default: the app supplies UUIDv7 at the
// call site (see apps/api/src/auth/user-repository.knex.ts `generateId`) so
// IDs stay sortable/non-guessable (TDD D5) without a Postgres v7 generator
// function, which RDS may not ship.
//
// Partial unique on `email WHERE status = 'active'` (not a plain UNIQUE): a
// hard-erased user's email is nulled (§6.3 erasure), and a later signup with
// that same address must not collide with the tombstoned row.
//
// The reserved "Deleted user" sentinel row (TDD §3.1/§6.3, D3) is seeded in
// this same migration with a fixed, well-known UUID so later app code and
// migrations can reference it by constant. No PII value is stored for it
// (email is NULL) — nothing sensitive lands in this migration file.
//
// data-plan: workspace/data-plan-todo-app.md §1.2

const SENTINEL_DELETED_USER_ID = '00000000-0000-7000-8000-000000000001'

export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE TYPE users_status AS ENUM ('active', 'deleted')")

  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary()
    t.specificType('email', 'citext').nullable()
    t.text('display_name').notNullable()
    t.text('avatar_initials').nullable()
    t.specificType('status', 'users_status').notNullable().defaultTo('active')
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    t.timestamp('deleted_at', { useTz: true }).nullable()
  })

  // Keep the tombstone state internally consistent: a deleted user must
  // carry a deleted_at timestamp (data-plan §1.14 / TDD §6.3).
  await knex.raw(`
    ALTER TABLE users
    ADD CONSTRAINT users_deleted_at_set_when_deleted
    CHECK (status <> 'deleted' OR deleted_at IS NOT NULL)
  `)

  // Partial unique: an erased user's nulled email never blocks a new signup
  // reusing that address (data-plan §1.2/§3.2).
  await knex.raw(`
    CREATE UNIQUE INDEX users_email_unique_active
    ON users (email)
    WHERE status = 'active'
  `)

  // Reserved sentinel row for re-attributing shared-team content authored by
  // an erased user (TDD §3.1, §6.3, D3). No real PII: email is NULL.
  await knex('users').insert({
    id: SENTINEL_DELETED_USER_ID,
    email: null,
    display_name: 'Deleted user',
    avatar_initials: null,
    status: 'deleted',
    deleted_at: knex.fn.now(),
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users')
  await knex.raw('DROP TYPE IF EXISTS users_status')
}
