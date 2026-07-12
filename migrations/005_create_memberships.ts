import type { Knex } from 'knex'

// S1 (auth & session) migration 5/5. `memberships` — user <-> team with role
// (TDD §3.1). This **is** the authorization source (TDD §4.1): the app
// derives `allowedTeamIds`/`roleByTeam` from it on every authenticated
// request, and S1's `GET /api/me` already returns the caller's memberships
// (apps/api/src/auth/user-repository.knex.ts `getWithMemberships`) — so this
// table is an S1 dependency even though team creation/management is S2.
//
// Row-Level Security: `memberships` IS a team-owned table (carries
// `team_id`) and is in scope for TDD §4.3 / data-plan §2's RLS policy
// (`team_id = current_setting('app.team_id')::uuid`). RLS is deliberately
// **NOT enabled in this migration** — see migration-notes-auth.md for the
// staging decision: the data-plan's design enables RLS uniformly, in one
// migration, once the rest of the team-owned tables (lists, tasks, tags,
// invites, ...) land in S2/S3/S4, rather than piecemeal per table. Enabling
// it here alone, before the scoped-repository seam (TDD §4.2) that sets the
// `app.team_id` GUC exists, would fail closed on every membership read and
// break `GET /api/me` for S1. Recorded as an explicit, reviewed deferral,
// not an oversight — flagged to security for the Gate-5/Gate-6 deep review.
//
// data-plan: workspace/data-plan-todo-app.md §1.5

export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE TYPE membership_role AS ENUM ('owner', 'member')")

  await knex.schema.createTable('memberships', (t) => {
    t.uuid('id').primary()
    t.uuid('team_id').notNullable().references('id').inTable('teams').onDelete('CASCADE')
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    t.specificType('role', 'membership_role').notNullable()
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    t.unique(['team_id', 'user_id'])
    t.index('user_id')
    t.index(['team_id', 'user_id']) // authz hot path, TDD §3.2
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('memberships')
  await knex.raw('DROP TYPE IF EXISTS membership_role')
}
