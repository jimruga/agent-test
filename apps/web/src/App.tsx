import type { ReactNode } from 'react'
import { TeamTodoApp } from './features/team-todo'
import { TEAM_TODO_MVP, useFeatureFlag } from './lib/feature-flags'

// The feature's UI tier is mounted only when the server says the flag is on.
// When off, the app shows the neutral signed-out shell (the API is dark too).
export function App(): ReactNode {
  const teamTodoEnabled = useFeatureFlag(TEAM_TODO_MVP)
  if (!teamTodoEnabled) {
    return <main>Sign in to continue.</main>
  }
  return <TeamTodoApp />
}
