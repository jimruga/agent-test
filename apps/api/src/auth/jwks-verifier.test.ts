import { describe, expect, it, vi } from 'vitest'
import { buildJwksVerifier } from './jwks-verifier'

// The JWKS key set is an opaque black box (jose's createRemoteJWKSet result); the
// helper only ever passes it through to `jwtVerify`, so a sentinel stands in here.
const keySet = { __jwks: true } as unknown

const ISSUER = 'https://accounts.google.com'
const AUDIENCE = 'client-123.apps.googleusercontent.com'

function verifierWith(payload: Record<string, unknown>) {
  const jwtVerify = vi.fn(async () => ({ payload }))
  const verify = buildJwksVerifier({ jwtVerify, keySet, issuer: ISSUER, audience: AUDIENCE })
  return { jwtVerify, verify }
}

describe('buildJwksVerifier', () => {
  it('verifies the token against the JWKS with the configured issuer and audience', async () => {
    const { jwtVerify, verify } = verifierWith({ sub: 's', email: 'a@b.co', email_verified: true })
    await verify('id-token')
    // iss/aud/exp/signature are delegated to jose via these exact options (A07/A08).
    expect(jwtVerify).toHaveBeenCalledWith('id-token', keySet, {
      issuer: ISSUER,
      audience: AUDIENCE,
    })
  })

  it('maps the verified claims into OAuthClaims (incl. nonce for replay matching)', async () => {
    const { verify } = verifierWith({
      sub: 'google-sub-123',
      email: 'ada@example.com',
      email_verified: true,
      name: 'Ada Lovelace',
      nonce: 'issued-nonce',
    })
    const claims = await verify('id-token')
    expect(claims).toEqual({
      subject: 'google-sub-123',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada Lovelace',
      nonce: 'issued-nonce',
    })
  })

  it('treats an absent or non-true email_verified as not verified (fail closed)', async () => {
    const { verify } = verifierWith({ sub: 's', email: 'a@b.co' })
    const claims = await verify('id-token')
    expect(claims.emailVerified).toBe(false)
  })

  it('throws when the sub claim is missing (fail closed — OWASP A08)', async () => {
    const { verify } = verifierWith({ email: 'a@b.co', email_verified: true })
    await expect(verify('id-token')).rejects.toThrow(/sub/)
  })

  it('throws when the email claim is missing (fail closed)', async () => {
    const { verify } = verifierWith({ sub: 's', email_verified: true })
    await expect(verify('id-token')).rejects.toThrow(/email/)
  })

  it('propagates a verification failure from jose (bad signature / iss / aud / exp)', async () => {
    const jwtVerify = vi.fn(async () => {
      throw new Error('signature verification failed')
    })
    const verify = buildJwksVerifier({ jwtVerify, keySet, issuer: ISSUER, audience: AUDIENCE })
    await expect(verify('id-token')).rejects.toThrow(/signature verification failed/)
  })
})
