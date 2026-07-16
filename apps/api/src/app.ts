import Fastify, { type FastifyInstance } from 'fastify'
import { registerAuthRoutes } from './auth/routes'
import type { AppDeps } from './deps'
import { registerTeamTodoFeature } from './features/team-todo'
import { registerErrorEnvelope } from './platform/error-envelope'

// The Fastify app instance is BUILT here and SERVED separately (index.ts), so
// tests exercise it in-process via `app.inject({ method, url })` — no network or
// port (api-conventions.md, Fastify pattern per ADR-0003). Every route mounts
// under the `/api` base path to match the openapi.yaml `servers` entry.
// Resolve Fastify's `trustProxy` from TRUSTED_PROXY_CIDR (F8-IP). Without this
// both rate-limit controls key on the ALB's IP (req.ip = the immediate TCP peer),
// collapsing per-client limits into one global counter in production.
//   - unset            → 1 (trust exactly one proxy hop: the ALB in front of EC2)
//   - a bare integer   → that hop count (as a NUMBER — a string like '1' is parsed
//                        by proxy-addr as a trusted-IP list, not a hop count, and
//                        would silently NOT resolve the client IP; see below)
//   - anything else    → passed through as a CIDR / comma-separated IP list
//                        (devops sets the VPC CIDR, e.g. '10.0.0.0/8', at deploy)
// The integer coercion is deliberate: `trustProxy: '1'` leaves req.ip as the socket
// IP, which would neutralize this fix — so a numeric env value becomes a number.
// The clamp to >= 1 guards against TRUSTED_PROXY_CIDR=0 (or any integer < 1):
// proxy-addr interprets 0 as "trust zero hops", collapsing req.ip back to the
// socket IP and silently re-breaking per-client rate limiting without any error.
function resolveTrustProxy(): number | string {
  const raw = process.env.TRUSTED_PROXY_CIDR
  if (raw === undefined || raw.trim() === '') return 1
  if (/^\d+$/.test(raw.trim())) {
    const parsed = Number(raw.trim())
    return parsed >= 1 ? parsed : 1
  }
  return raw.trim()
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    // Trust the fronting proxy so req.ip is the real client, not the ALB (F8-IP).
    // Scoped by hop count / CIDR — never `true`, which makes req.ip fully spoofable.
    trustProxy: resolveTrustProxy(),
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    // Do not expose framework internals or request bodies in error output.
    disableRequestLogging: process.env.NODE_ENV === 'test',
  })

  registerErrorEnvelope(app)

  // Edge security: helmet on every response + a per-route rate limiter for the
  // /api/auth group (F8/F9). Registered before any route so the hooks cover them,
  // including /ping. Injected (see AppDeps) so the unit app stays plugin-free.
  deps.registerSecurityPlugins?.(app)

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
