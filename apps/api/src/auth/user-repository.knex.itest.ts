import knexFactory, { type Knex } from 'knex'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { KnexUserRepository } from './user-repository.knex'

// Integration test for the PRODUCTION KnexUserRepository against a REAL Postgres
// (CI's postgres:16 service), exercising the code path the no-DB unit `verify`
// lane cannot — the in-memory fake turns green regardless of whether the SQL is
// correct (review W4). Runs ONLY in the dedicated integration lane
// (`npm run test:integration`, file glob `*.itest.ts`), never in the unit lane,
// so `verify.sh` stays hermetic (ADR-0004 no-DB lane).
//
// Preconditions (provided by the CI `integration` job): DATABASE_URL is set and
// migrations 001-005 are already applied. Locally, run against any throwaway
// Postgres with the migrations applied. When DATABASE_URL is absent the suite
// skips (so a developer's unit run never fails on a missing DB).
//
// PAVED-ROAD PRECEDENT: this is the template for every later repository
// integration test — real driver, migrated schema, truncate-per-test isolation,
// assert through the repository's public interface (not private SQL).

const DATABASE_URL = process.env.DATABASE_URL
const describeIntegration = DATABASE_URL ? describe : describe.skip

describeIntegration('KnexUserRepository (integration · real Postgres)', () => {
  let knex: Knex
  let repo: KnexUserRepository

  beforeAll(() => {
    knex = knexFactory({ client: 'pg', connection: DATABASE_URL })
    repo = new KnexUserRepository(knex, uuidv7)
  })

  afterAll(async () => {
    await knex.destroy()
  })

  beforeEach(async () => {
    // Per-test isolation. CASCADE clears dependent rows; the migration-seeded
    // "Deleted user" sentinel is not needed by these cases.
    await knex.raw('TRUNCATE memberships, oauth_identities, teams, users CASCADE')
  })

  const oauthInput = {
    provider: 'google',
    subject: 'google-sub-abc',
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
  }

  it('creates the user + oauth_identity on first login (create-on-first-login)', async () => {
    const { user, isNew } = await repo.findOrCreateFromOAuth(oauthInput)

    expect(isNew).toBe(true)
    expect(user.email).toBe('ada@example.com')
    expect(user.displayName).toBe('Ada Lovelace')
    expect(user.avatarInitials).toBe('AL')

    const userRows = await knex('users').where({ id: user.id })
    expect(userRows).toHaveLength(1)
    expect(userRows[0].status).toBe('active')

    const identities = await knex('oauth_identities').where({
      provider: 'google',
      provider_subject: 'google-sub-abc',
    })
    expect(identities).toHaveLength(1)
    expect(identities[0].user_id).toBe(user.id)
  })

  it('is idempotent by (provider, subject): a second login returns the same user with no duplicate rows', async () => {
    const first = await repo.findOrCreateFromOAuth(oauthInput)
    const second = await repo.findOrCreateFromOAuth({ ...oauthInput, displayName: 'Ada L.' })

    expect(second.isNew).toBe(false)
    expect(second.user.id).toBe(first.user.id)

    expect(await knex('users')).toHaveLength(1)
    expect(await knex('oauth_identities')).toHaveLength(1)
  })

  it('getWithMemberships joins the user to their team memberships', async () => {
    const { user } = await repo.findOrCreateFromOAuth(oauthInput)
    const teamId = uuidv7()
    await knex('teams').insert({ id: teamId, name: 'Team A', created_by: user.id })
    await knex('memberships').insert({ id: uuidv7(), team_id: teamId, user_id: user.id, role: 'owner' })

    const me = await repo.getWithMemberships(user.id)

    expect(me).not.toBeNull()
    expect(me?.id).toBe(user.id)
    expect(me?.email).toBe('ada@example.com')
    expect(me?.memberships).toEqual([{ teamId, role: 'owner' }])
  })

  it("excludes a tombstoned (status <> 'active') user from getWithMemberships (fail closed on erasure)", async () => {
    const { user } = await repo.findOrCreateFromOAuth(oauthInput)
    await knex('users').where({ id: user.id }).update({ status: 'deleted', deleted_at: knex.fn.now() })

    expect(await repo.getWithMemberships(user.id)).toBeNull()
  })
})
