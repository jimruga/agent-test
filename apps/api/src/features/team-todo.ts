import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../deps'
import { TEAM_TODO_MVP } from '../platform/feature-flags'

// Flag-gated feature registration (S0.3 seam, TDD §7). When `team_todo_mvp` is
// OFF the feature routes are NOT registered at all — so they 404 and the feature
// is genuinely dark (not merely hidden client-side). Flipping the flag off is the
// kill switch: it removes the routes without a deploy.
//
// The route below is a SEAM PLACEHOLDER proving dark/live behavior; S2 replaces it
// with the real, tenant-scoped team endpoints (server-derived TenantContext +
// scoped repository + RLS). Do not build tenancy logic on this stub.
export function registerTeamTodoFeature(app: FastifyInstance, deps: AppDeps): void {
  if (!deps.flags.isEnabled(TEAM_TODO_MVP)) return

  app.get('/teams', async (_req, reply) => {
    // Placeholder — S2 implements the real membership-scoped listing.
    return reply.code(200).send({ items: [] })
  })
}
