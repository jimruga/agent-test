import { describe, expect, it } from 'vitest'
import { InMemoryUserRepository, deriveInitials } from './user-repository'

describe('deriveInitials', () => {
  it('takes first+last initials, uppercased', () => {
    expect(deriveInitials('ada lovelace')).toBe('AL')
  })
  it('uses a single initial for a one-word name', () => {
    expect(deriveInitials('Cher')).toBe('C')
  })
  it('returns null for an empty/whitespace name', () => {
    expect(deriveInitials('   ')).toBeNull()
  })
})

describe('InMemoryUserRepository', () => {
  let counter = 0
  const repo = () => new InMemoryUserRepository(() => `user-${++counter}`)

  it('creates a user on first OAuth sign-in and links the identity', async () => {
    const r = repo()
    const { user, isNew } = await r.findOrCreateFromOAuth({
      provider: 'google',
      subject: 'sub-1',
      email: 'ada@example.com',
      displayName: 'Ada Lovelace',
    })
    expect(isNew).toBe(true)
    expect(user.email).toBe('ada@example.com')
    expect(user.avatarInitials).toBe('AL')
  })

  it('returns the same user (not a new one) for a repeat sign-in with the same subject', async () => {
    const r = repo()
    const first = await r.findOrCreateFromOAuth({ provider: 'google', subject: 'sub-x', email: 'a@b.co', displayName: 'A B' })
    const second = await r.findOrCreateFromOAuth({ provider: 'google', subject: 'sub-x', email: 'a@b.co', displayName: 'A B' })
    expect(second.isNew).toBe(false)
    expect(second.user.id).toBe(first.user.id)
  })

  it('getWithMemberships reflects granted memberships and returns null for unknown users', async () => {
    const r = repo()
    const { user } = await r.findOrCreateFromOAuth({ provider: 'google', subject: 's', email: 'e@x.co', displayName: 'E X' })
    r.addMembership(user.id, { teamId: 'team-1', role: 'owner' })
    const me = await r.getWithMemberships(user.id)
    expect(me?.memberships).toEqual([{ teamId: 'team-1', role: 'owner' }])
    expect(await r.getWithMemberships('nope')).toBeNull()
  })
})
