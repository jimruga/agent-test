import { afterEach, describe, expect, it } from 'vitest'
import { createDevResolver, unwiredSecretResolver } from './secrets'

describe('unwiredSecretResolver', () => {
  it('fails closed (throws) so no code path proceeds without a real secret', async () => {
    await expect(unwiredSecretResolver('arn:aws:secretsmanager:...:secret:x')).rejects.toThrow(
      /SecretResolver not wired/,
    )
  })
})

describe('createDevResolver (NODE_ENV=development plain-value fallback)', () => {
  const VAR = 'TEST_DEV_SECRET'
  afterEach(() => {
    delete process.env[VAR]
  })

  it('returns the plain value from the named env var (ignoring the ARN arg)', async () => {
    process.env[VAR] = 'plain-local-dev-value'
    const resolve = createDevResolver(VAR)
    await expect(resolve('arn:aws:ignored')).resolves.toBe('plain-local-dev-value')
  })

  it('throws when the env var is unset (fail closed, names the missing var)', async () => {
    const resolve = createDevResolver(VAR)
    await expect(resolve('arn:aws:ignored')).rejects.toThrow(/TEST_DEV_SECRET is not set/)
  })
})
