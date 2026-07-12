import { describe, expect, it } from 'vitest'
import { StaticFeatureFlags, TEAM_TODO_MVP, flagsFromEnv } from './feature-flags'

describe('feature flags', () => {
  it('defaults every flag to off (feature dark) when none are configured', () => {
    const flags = new StaticFeatureFlags()
    expect(flags.isEnabled(TEAM_TODO_MVP)).toBe(false)
  })

  it('enables only the flags explicitly turned on', () => {
    const flags = new StaticFeatureFlags([TEAM_TODO_MVP])
    expect(flags.isEnabled(TEAM_TODO_MVP)).toBe(true)
    expect(flags.isEnabled('some_other_flag')).toBe(false)
  })

  it('reads the on-list from env (comma-separated), dark when absent', () => {
    expect(flagsFromEnv({ FEATURE_FLAGS: 'team_todo_mvp, other' }).isEnabled(TEAM_TODO_MVP)).toBe(true)
    expect(flagsFromEnv({}).isEnabled(TEAM_TODO_MVP)).toBe(false)
  })
})
