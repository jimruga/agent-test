// DTOs the web client consumes for auth/session. These are the *safe* shapes:
// they never carry OAuth access/refresh tokens, the opaque session id, or the
// provider secret — those stay server-side only (TDD §5). PII (email/display
// name) is user-facing profile data the authenticated owner may see about
// themselves; it is not logged and not placed in analytics (TDD §3.3, §5.4).

export type TeamRole = 'owner' | 'member'

export interface MembershipSummary {
  readonly teamId: string
  readonly role: TeamRole
}

export interface CurrentUser {
  readonly id: string
  readonly displayName: string
  readonly email: string
  readonly avatarInitials: string | null
  readonly memberships: readonly MembershipSummary[]
}
