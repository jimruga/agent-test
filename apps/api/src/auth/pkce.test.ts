import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  codeChallengeS256,
  generateCodeVerifier,
  generateNonce,
  generatePreAuthId,
  generateSessionId,
  generateState,
  timingSafeStrEqual,
} from './pkce'

describe('pkce', () => {
  it('derives an S256 challenge that matches an independent SHA-256/base64url computation', () => {
    const verifier = generateCodeVerifier()
    const expected = createHash('sha256').update(verifier).digest().toString('base64url')
    expect(codeChallengeS256(verifier)).toBe(expected)
  })

  it('produces url-safe values with no base64 padding or unsafe chars', () => {
    for (const value of [
      generateCodeVerifier(),
      generateState(),
      generateNonce(),
      generateSessionId(),
      generatePreAuthId(),
    ]) {
      expect(value).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(value).not.toContain('=')
    }
  })

  it('emits a code_verifier within the RFC 7636 length window (43..128)', () => {
    const verifier = generateCodeVerifier()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
  })

  it('generates unique, high-entropy values across calls', () => {
    const many = new Set(Array.from({ length: 100 }, () => generateSessionId()))
    expect(many.size).toBe(100)
  })

  describe('timingSafeStrEqual', () => {
    it('returns true for identical strings', () => {
      const v = generateState()
      expect(timingSafeStrEqual(v, v)).toBe(true)
      expect(timingSafeStrEqual('abc', 'abc')).toBe(true)
    })

    it('returns false for differing equal-length strings', () => {
      expect(timingSafeStrEqual('abc', 'abd')).toBe(false)
    })

    it('returns false (never throws) for differing lengths', () => {
      expect(timingSafeStrEqual('abc', 'abcd')).toBe(false)
      expect(timingSafeStrEqual('', 'x')).toBe(false)
    })
  })
})
