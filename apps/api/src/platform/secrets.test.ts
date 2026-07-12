import { describe, expect, it } from 'vitest'
import { unwiredSecretResolver } from './secrets'

describe('unwiredSecretResolver', () => {
  it('fails closed (throws) so no code path proceeds without a real secret', async () => {
    await expect(unwiredSecretResolver('arn:aws:secretsmanager:...:secret:x')).rejects.toThrow(
      /SecretResolver not wired/,
    )
  })
})
