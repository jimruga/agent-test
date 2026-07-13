import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import {
  errorBody,
  registerErrorEnvelope,
  safeErrorLogFields,
  statusForCode,
} from './error-envelope'

describe('error envelope helpers', () => {
  it('maps codes to the right status', () => {
    expect(statusForCode('not_found')).toBe(404)
    expect(statusForCode('unauthenticated')).toBe(401)
    expect(statusForCode('rate_limited')).toBe(429)
    expect(statusForCode('internal')).toBe(500)
  })

  it('builds the envelope shape, with details only when provided', () => {
    expect(errorBody('bad_request', 'nope')).toEqual({
      error: { code: 'bad_request', message: 'nope' },
    })
    expect(errorBody('unprocessable', 'bad', [{ field: 'email', message: 'invalid' }])).toEqual({
      error: {
        code: 'unprocessable',
        message: 'bad',
        details: [{ field: 'email', message: 'invalid' }],
      },
    })
  })
})

describe('safeErrorLogFields (no PII / no pg detail leaks — sec F2)', () => {
  it('keeps only allowlisted structural fields and drops message/stack + pg detail/hint/where/etc', () => {
    // Simulate a node-postgres unique-violation error: PII can live BOTH in the
    // driver-populated fields (detail/hint/where) AND in the message/stack (a
    // message can embed an interpolated email or an OAuth response body).
    const pgErr = Object.assign(
      new Error('duplicate key: contact ada@example.com already exists'),
      {
        name: 'error',
        code: '23505',
        statusCode: 500,
        detail: 'Key (email)=(ada@example.com) already exists.',
        hint: 'Consider ada@example.com',
        where: 'row for relation "users"',
        table: 'users',
        column: 'email',
        schema: 'public',
        constraint: 'users_email_unique_active',
        parameters: ['ada@example.com', 'Ada Lovelace'],
        routine: '_bt_check_unique',
      },
    )

    const fields = safeErrorLogFields(pgErr)

    // Safe structural fields present when set on the input.
    expect(fields).toMatchObject({ name: 'error', code: '23505', statusCode: 500 })

    // Free-text / PII-bearing / internal fields must NOT be serialized.
    for (const banned of [
      'message',
      'stack',
      'detail',
      'hint',
      'where',
      'table',
      'column',
      'schema',
      'constraint',
      'parameters',
      'routine',
    ]) {
      expect(fields).not.toHaveProperty(banned)
    }
    // Belt and suspenders: the email must not appear anywhere in the record.
    expect(JSON.stringify(fields)).not.toContain('ada@example.com')
  })

  it('handles a non-Error throw without leaking its contents', () => {
    const fields = safeErrorLogFields({ secret: 'ada@example.com' })
    expect(fields).toEqual({ name: 'NonError', type: 'object' })
    expect(JSON.stringify(fields)).not.toContain('ada@example.com')
  })
})

describe('registerErrorEnvelope (handler behavior)', () => {
  async function appWith() {
    const app = Fastify({ logger: false })
    registerErrorEnvelope(app)
    app.get('/boom', async () => {
      throw new Error('internal detail that must not leak')
    })
    app.get('/bad', async () => {
      const err = new Error('explicitly bad') as Error & { statusCode?: number }
      err.statusCode = 422
      throw err
    })
    await app.ready()
    return app
  }

  it('turns an unexpected throw into a generic 500 envelope (no internal leak)', async () => {
    const app = await appWith()
    const res = await app.inject({ method: 'GET', url: '/boom' })
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: { code: 'internal', message: 'Something went wrong' } })
    expect(res.body).not.toContain('internal detail')
  })

  it('preserves a thrown status code and maps it to the right envelope code', async () => {
    const app = await appWith()
    const res = await app.inject({ method: 'GET', url: '/bad' })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('unprocessable')
  })

  it('returns the envelope for unknown routes', async () => {
    const app = await appWith()
    const res = await app.inject({ method: 'GET', url: '/nowhere' })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('not_found')
  })
})
