import { createContext, useContext, type ReactNode } from 'react'

// Web mirror of the server feature-flag decision (TDD §7). The client only
// REFLECTS the server's decision for rendering — it is NEVER a security control
// (the API 404s dark routes regardless of what the SPA renders). The set of
// enabled flags is provided by the server (e.g. alongside /me) at bootstrap.
const FeatureFlagContext = createContext<ReadonlySet<string>>(new Set())

export function FeatureFlagProvider({
  enabled,
  children,
}: {
  enabled: Iterable<string>
  children: ReactNode
}): ReactNode {
  return <FeatureFlagContext.Provider value={new Set(enabled)}>{children}</FeatureFlagContext.Provider>
}

export function useFeatureFlag(flag: string): boolean {
  return useContext(FeatureFlagContext).has(flag)
}

export const TEAM_TODO_MVP = 'team_todo_mvp'
