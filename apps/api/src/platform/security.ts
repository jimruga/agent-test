// Edge security plugins (F8 rate limiting, F9 security headers). This is the ONLY
// module that imports the third-party Fastify security plugins; it is wired at the
// composition root (index.ts) and injected into buildApp via `AppDeps`, exactly
// like the OAuth provider / session store. Keeping the imports here (not in app.ts)
// means the in-memory unit suite never pulls the edge plugins — they are exercised
// by their own dedicated tests that opt in.

import fastifyHelmet from '@fastify/helmet'
import fastifyRateLimit from '@fastify/rate-limit'
import type { ApiErrorBody } from '@repo/shared'
import type { FastifyInstance, FastifyRequest } from 'fastify'

// 180 days, in seconds — the HSTS max-age for the API origin.
const HSTS_MAX_AGE_SECONDS = 15_552_000

/**
 * Register helmet (all responses) + rate-limit (opt-in per route via
 * `config.rateLimit`) on the root app. Call BEFORE routes so the hooks cover them.
 *
 * - Helmet uses the strictest CSP because this is a JSON-only API that renders no
 *   HTML: nothing may be loaded or framed. (F9)
 * - Rate-limit is registered with `global: false`, so only routes that declare a
 *   `config.rateLimit` (the `/api/auth` group) are limited; `/ping` and the rest
 *   are untouched. A breach returns 429 in the shared `ApiErrorBody` envelope. (F8)
 */
export function registerSecurityPlugins(app: FastifyInstance): void {
  app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      // useDefaults:false — helmet otherwise MERGES its own default directives
      // (script-src 'self', style-src 'self', img-src 'self', …) into ours, which
      // would silently override default-src 'none' for those resource types and
      // emit a policy more permissive than declared. This is a JSON-only API that
      // renders no HTML, so the policy must be exactly these two directives. (W2)
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: {
      maxAge: HSTS_MAX_AGE_SECONDS,
      includeSubDomains: true,
      preload: false,
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'no-referrer' },
  })

  app.register(fastifyRateLimit, {
    global: false,
    // Wrap the breach response in the platform error envelope so clients see one
    // consistent error contract (matches platform/error-envelope.ts).
    errorResponseBuilder: (_req: FastifyRequest, context: { after: string }): ApiErrorBody => ({
      error: {
        code: 'rate_limited',
        message: `Rate limit exceeded, retry in ${context.after}`,
      },
    }),
  })
}
