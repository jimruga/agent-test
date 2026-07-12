// Cookie (de)serialization for the opaque session id and the short-lived
// pre-auth id. Done explicitly (no plugin) so the security-relevant flags are
// visible and testable: HttpOnly (no JS access → XSS can't read the session),
// Secure (HTTPS only), SameSite (CSRF defense), Path, and Max-Age. The cookie
// value is an opaque store key — never a JWT and never any PII (TDD §5.2).

export interface CookieFlags {
  readonly secure: boolean
  readonly sameSite: 'Lax' | 'Strict' | 'None'
  readonly maxAgeSeconds: number
  readonly path?: string
}

function serialize(name: string, value: string, flags: CookieFlags): string {
  const parts = [
    `${name}=${value}`,
    `Path=${flags.path ?? '/'}`,
    'HttpOnly',
    `SameSite=${flags.sameSite}`,
    `Max-Age=${flags.maxAgeSeconds}`,
  ]
  if (flags.secure) parts.push('Secure')
  return parts.join('; ')
}

export function serializeSessionCookie(
  name: string,
  sessionId: string,
  flags: CookieFlags,
): string {
  return serialize(name, sessionId, flags)
}

/** Expire the cookie immediately (Max-Age=0) with the same flags used to set it. */
export function clearCookie(name: string, flags: Omit<CookieFlags, 'maxAgeSeconds'>): string {
  return serialize(name, '', { ...flags, maxAgeSeconds: 0 })
}

/** Parse a raw `Cookie` header into a name→value map. Tolerates missing header. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=')
    if (idx < 0) continue
    const name = pair.slice(0, idx).trim()
    if (name) out[name] = pair.slice(idx + 1).trim()
  }
  return out
}
