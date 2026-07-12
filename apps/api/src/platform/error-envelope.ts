import type { ApiErrorBody, ApiErrorCode } from '@repo/shared'
import type { FastifyInstance, FastifyReply } from 'fastify'

// Consistent error envelope for every non-2xx JSON response (TDD §2.1). Never
// leaks stack traces, SQL, or another tenant's data. The status-code mapping is
// centralized so all handlers speak one dialect.

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  rate_limited: 429,
  internal: 500,
}

export function statusForCode(code: ApiErrorCode): number {
  return STATUS_BY_CODE[code]
}

export function errorBody(code: ApiErrorCode, message: string, details?: ApiErrorBody['error']['details']): ApiErrorBody {
  return { error: { code, message, ...(details ? { details } : {}) } }
}

/** Send a typed error response with the mapped status code. */
export function sendError(
  reply: FastifyReply,
  code: ApiErrorCode,
  message: string,
  details?: ApiErrorBody['error']['details'],
): FastifyReply {
  return reply.code(statusForCode(code)).send(errorBody(code, message))
}

/**
 * Whitelist the ONLY fields safe to ship to server logs (Logz.io/Sentry) for a
 * failed request. node-postgres errors carry `detail`/`where`/`table`/`column`/
 * `parameters` fields that frequently embed row VALUES (e.g. the conflicting
 * `email` on a unique violation) — serializing the whole `err` would write
 * regulated PII into logs (sec F2, OWASP A09 + a privacy/retention violation).
 * We therefore build the log record from an explicit allowlist and never spread
 * the error object, so any current or future pg/driver field is dropped by
 * construction rather than by blocklist.
 */
export function safeErrorLogFields(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) {
    return { name: 'NonError', type: typeof err }
  }
  const withCode = err as Error & { code?: unknown; statusCode?: unknown }
  const code = typeof withCode.code === 'string' || typeof withCode.code === 'number' ? withCode.code : undefined
  const statusCode = typeof withCode.statusCode === 'number' ? withCode.statusCode : undefined
  return {
    name: err.name,
    message: err.message,
    stack: err.stack,
    ...(code !== undefined ? { code } : {}),
    ...(statusCode !== undefined ? { statusCode } : {}),
  }
}

/**
 * Register a global error handler + 404 handler so unexpected throws and unknown
 * routes still produce the envelope (and never a raw stack trace to the client).
 */
export function registerErrorEnvelope(app: FastifyInstance): void {
  app.setNotFoundHandler((_req, reply) => {
    sendError(reply, 'not_found', 'Resource not found')
  })
  app.setErrorHandler((err, req, reply) => {
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500
    if (status >= 500) {
      // Log the real error server-side, but ONLY the allowlisted safe fields —
      // never the raw `err`, whose pg detail/where/parameters can carry row PII
      // (sec F2, OWASP A09). Return a generic message so internals never leak.
      req.log.error(safeErrorLogFields(err), 'unhandled error')
      sendError(reply, 'internal', 'Something went wrong')
      return
    }
    sendError(reply, codeForStatus(status), err.message || 'Bad request')
  })
}

const CODE_BY_STATUS: Record<number, ApiErrorCode> = {
  400: 'bad_request',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'unprocessable',
  429: 'rate_limited',
}

function codeForStatus(status: number): ApiErrorCode {
  return CODE_BY_STATUS[status] ?? 'bad_request'
}
