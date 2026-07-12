import type { Knex } from 'knex'

// S1 (auth & session) migration 3/5. `oauth_identities` — provider linkage
// for a user (TDD §3.1). Deliberately holds NO OAuth tokens: access/refresh
// tokens live server-side only in the Redis session store
// (apps/api/src/auth/session-store.ts `RedisSessionStore`), never in
// Postgres (TDD §5, data-plan §3.1 "OAuth access/refresh tokens -> Regulated,
// never stored in Postgres").
//
// PII classification: `provider_subject` is Regulated PII (a stable
// third-party identifier, indirectly identifying a person) — data-plan §3.1.
//
// ON DELETE CASCADE off `users`: deleting the parent user row also removes
// its provider linkage. In practice erasure (TDD §6.3) tombstones the user
// row instead of deleting it and explicitly deletes oauth_identities rows in
// the same transaction — this FK is the backstop for any other deletion path.
//
// data-plan: workspace/data-plan-todo-app.md §1.3

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('oauth_identities', (t) => {
    t.uuid('id').primary()
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    t.text('provider').notNullable()
    t.text('provider_subject').notNullable()
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    t.unique(['provider', 'provider_subject'])
    t.index('user_id')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('oauth_identities')
}
