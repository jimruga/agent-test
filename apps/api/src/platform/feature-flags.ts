// Feature-flag seam (feature-flags-progressive-delivery skill, TDD §7).
// Evaluated SERVER-SIDE. In production this is backed by AWS AppConfig / an
// OpenFeature provider; for the MVP bootstrap a static provider (env-seeded)
// implements the same interface so the seam is real from day one and the
// backing store can be swapped without touching call sites (dependency
// inversion). Flags default to FALSE — the feature is dark unless turned on.

export interface FeatureFlags {
  isEnabled(flag: string): boolean
}

export class StaticFeatureFlags implements FeatureFlags {
  private readonly enabled: ReadonlySet<string>
  constructor(enabled: Iterable<string> = []) {
    this.enabled = new Set(enabled)
  }
  isEnabled(flag: string): boolean {
    return this.enabled.has(flag)
  }
}

/**
 * Build flags from env. `FEATURE_FLAGS` is a comma-separated allowlist of the
 * flags that are ON (e.g. "team_todo_mvp"). Absent/empty → everything dark.
 */
export function flagsFromEnv(env: NodeJS.ProcessEnv = process.env): FeatureFlags {
  const on = (env.FEATURE_FLAGS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return new StaticFeatureFlags(on)
}

/** The single flag gating the Team To-Do MVP (registry: reliability/flags-registry.json). */
export const TEAM_TODO_MVP = 'team_todo_mvp'
