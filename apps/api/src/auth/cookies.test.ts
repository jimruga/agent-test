import { describe, expect, it } from 'vitest'
import { clearCookie, parseCookies, serializeSessionCookie } from './cookies'

describe('cookies', () => {
  it('always sets HttpOnly and SameSite, and Secure when configured', () => {
    const c = serializeSessionCookie('sid', 'opaque-value', {
      secure: true,
      sameSite: 'Lax',
      maxAgeSeconds: 3600,
    })
    expect(c).toContain('sid=opaque-value')
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Lax')
    expect(c).toContain('Secure')
    expect(c).toContain('Path=/')
    expect(c).toContain('Max-Age=3600')
  })

  it('omits Secure only when explicitly disabled (local http dev)', () => {
    const c = serializeSessionCookie('sid', 'v', {
      secure: false,
      sameSite: 'Lax',
      maxAgeSeconds: 60,
    })
    expect(c).not.toContain('Secure')
    // HttpOnly is NOT optional — it must remain even without Secure.
    expect(c).toContain('HttpOnly')
  })

  it('clearing a cookie expires it immediately with Max-Age=0', () => {
    const c = clearCookie('sid', { secure: true, sameSite: 'Lax' })
    expect(c).toContain('Max-Age=0')
    expect(c).toContain('HttpOnly')
  })

  it('parses a cookie header into name/value pairs and tolerates a missing header', () => {
    expect(parseCookies('sid=abc; other=def')).toEqual({ sid: 'abc', other: 'def' })
    expect(parseCookies(undefined)).toEqual({})
  })
})
