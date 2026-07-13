import type { CurrentUser, MembershipSummary } from '@repo/shared'

// Persistence boundary for users + their OAuth identities + memberships
// (Repository pattern). Routes depend on this interface; the in-memory impl below
// proves the auth spine end-to-end without a live DB (so the CI `verify` lane needs
// no Postgres), and the Knex-backed impl (user-repository.knex.ts) lands with the
// data-engineer's migration in the same PR (schema: TDD §3 users/oauth_identities).

export interface OAuthUpsert {
  readonly provider: string
  readonly subject: string
  readonly email: string
  readonly displayName: string
}

export interface UserRecord {
  readonly id: string
  readonly email: string
  readonly displayName: string
  readonly avatarInitials: string | null
}

export interface UserRepository {
  /** Upsert by (provider, subject): create on first sign-in, else return the linked user. */
  findOrCreateFromOAuth(input: OAuthUpsert): Promise<{ user: UserRecord; isNew: boolean }>
  /** Full profile + memberships for /me; null if the id no longer exists. */
  getWithMemberships(userId: string): Promise<CurrentUser | null>
}

/** Derive up to two uppercase initials from a display name (UX §12; no external avatar). */
export function deriveInitials(displayName: string): string | null {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  const initials = (first + last).toUpperCase()
  return initials || null
}

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, UserRecord>()
  private readonly identityIndex = new Map<string, string>() // `${provider}:${subject}` -> userId
  private readonly memberships = new Map<string, MembershipSummary[]>() // userId -> memberships

  constructor(private readonly generateId: () => string) {}

  async findOrCreateFromOAuth(input: OAuthUpsert): Promise<{ user: UserRecord; isNew: boolean }> {
    const key = `${input.provider}:${input.subject}`
    const existingId = this.identityIndex.get(key)
    if (existingId) {
      const user = this.users.get(existingId)
      if (user) return { user, isNew: false }
    }
    const id = this.generateId()
    const user: UserRecord = {
      id,
      email: input.email,
      displayName: input.displayName,
      avatarInitials: deriveInitials(input.displayName),
    }
    this.users.set(id, user)
    this.identityIndex.set(key, id)
    this.memberships.set(id, [])
    return { user, isNew: true }
  }

  async getWithMemberships(userId: string): Promise<CurrentUser | null> {
    const user = this.users.get(userId)
    if (!user) return null
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      avatarInitials: user.avatarInitials,
      memberships: this.memberships.get(userId) ?? [],
    }
  }

  /** Test/seed helper — grant a membership so /me can reflect team scope. */
  addMembership(userId: string, membership: MembershipSummary): void {
    const list = this.memberships.get(userId) ?? []
    list.push(membership)
    this.memberships.set(userId, list)
  }
}
