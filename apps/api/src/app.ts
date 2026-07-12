import Fastify, { type FastifyInstance } from 'fastify'
import { registerAuthRoutes } from './auth/routes'
import type { AppDeps } from './deps'
import { registerTeamTodoFeature } from './features/team-todo'
import { registerErrorEnvelope } from './platform/error-envelope'

// The Fastify app instance is BUILT here and SERVED separately (index.ts), so
// tests exercise it in-process via `app.inject({ method, url })` — no network or
// port (api-conventions.md, Fastify pattern per ADR-0003). Every route mounts
// under the `/api` base path to match the openapi.yaml `servers` entry.
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    // Do not expose framework internals or request bodies in error output.
    disableRequestLogging: process.env.NODE_ENV === 'test',
  })

  registerErrorEnvelope(app)

  // Operational-only liveness probe — intentionally NOT in openapi.yaml and not
  // under /api (load balancers hit it directly).
  app.get('/ping', async () => ({ status: 'ok' }))

  app.register(
    async (api) => {
      registerAuthRoutes(api, deps)
      registerTeamTodoFeature(api, deps)
    },
    { prefix: '/api' },
  )

  return app
}
