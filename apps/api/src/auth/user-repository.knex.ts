import type { CurrentUser, MembershipSummary, TeamRole } from '@repo/shared'
import type { Knex } from 'knex'
import { deriveInitials, type OAuthUpsert, type UserRecord, type UserRepository } from './user-repository'

// Production persistence adapter (schema: TDD §3 users / oauth_identities /
// memberships). The DDL is authored by the DATA-ENGINEER as Knex migrations into
// the `migrations/` location and reviewed in the SAME PR as this code (branch
// policy). This adapter is exercised by the migration/integration lane (CI spins
// up Postgres), not the unit `verify` lane — hence it is excluded from unit
// coverage. `generateId` supplies UUIDv7 (TDD §3, D5), injected at the edge.

interface UserRow {
  id: string
  email: string | null
  display_name: string
  avatar_initials: string | null
}

interface MembershipRow {
  team_id: string
  role: TeamRole
}

export class KnexUserRepository implements UserRepository {
  constructor(
    private readonly knex: Knex,
    private readonly generateId: () => string,
  ) {}

  async findOrCreateFromOAuth(input: OAuthUpsert): Promise<{ user: UserRecord; isNew: boolean }> {
    return this.knex.transaction(async (trx) => {
      const identity = await trx('oauth_identities')
        .where({ provider: input.provider, provider_subject: input.subject })
        .first<{ user_id: string }>()

      if (identity) {
        const existing = await trx('users').where({ id: identity.user_id }).first<UserRow>()
        if (existing) return { user: toRecord(existing), isNew: false }
      }

      const id = this.generateId()
      const initials = deriveInitials(input.displayName)
      await trx('users').insert({
        id,
        email: input.email,
        display_name: input.displayName,
        avatar_initials: initials,
        status: 'active',
      })
      await trx('oauth_identities').insert({
        id: this.generateId(),
        user_id: id,
        provider: input.provider,
        provider_subject: input.subject,
      })
      return {
        user: { id, email: input.email, displayName: input.displayName, avatarInitials: initials },
        isNew: true,
      }
    })
  }

  async getWithMemberships(userId: string): Promise<CurrentUser | null> {
    const user = await this.knex('users').where({ id: userId, status: 'active' }).first<UserRow>()
    if (!user) return null
    const rows = await this.knex('memberships').where({ user_id: userId }).select<MembershipRow[]>('team_id', 'role')
    const memberships: MembershipSummary[] = rows.map((r) => ({ teamId: r.team_id, role: r.role }))
    return {
      id: user.id,
      displayName: user.display_name,
      email: user.email ?? '',
      avatarInitials: user.avatar_initials,
      memberships,
    }
  }
}

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email ?? '',
    displayName: row.display_name,
    avatarInitials: row.avatar_initials,
  }
}
