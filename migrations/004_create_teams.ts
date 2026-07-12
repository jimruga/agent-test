import type { Knex } from 'knex'

// S1 (auth & session) migration 4/5. `teams` — the tenant (TDD §3.1).
//
// NOT an S1 feature table — S1 does not create, list, or render teams. This
// is a **minimal referential prerequisite**: `memberships.team_id` (the next
// migration) is a NOT NULL FK to `teams(id)`, and `GET /api/me` (S1) already
// returns the caller's memberships (apps/api/src/auth/user-repository.knex.ts
// `getWithMemberships`), so the `memberships` table must exist and its FK
// target must be real for the migration to apply in CI. Landing an empty
// `teams` table now avoids a broken FK; it carries no S1 behavior.
//
// S2 (Teams & tenant-isolation foundation, workspace/stories-todo-app.md)
// owns the actual feature: create-team endpoint, the scoped/tenant
// repository, and Postgres RLS across all team-owned tables (TDD §4,
// data-plan §2). This migration deliberately does NOT enable RLS on `teams`
// — `teams` has no `team_id` column (it *is* the tenant) and the
// membership-scoped visibility policy the data-plan describes (§2.3) belongs
// with S2's migration, once the rest of the team-owned tables it's staged
// alongside (lists, tasks, tags, ...) also exist. See migration-notes-auth.md
// for the full RLS staging decision.
//
// data-plan: workspace/data-plan-todo-app.md §1.4

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('teams', (t) => {
    t.uuid('id').primary()
    t.text('name').notNullable()
    t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL')
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    t.timestamp('deleted_at', { useTz: true }).nullable()

    t.index('created_by')
  })

  await knex.raw(`
    ALTER TABLE teams
    ADD CONSTRAINT teams_name_length CHECK (length(name) BETWEEN 1 AND 200)
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('teams')
}
