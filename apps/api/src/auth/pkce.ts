import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

// PKCE + anti-CSRF/replay primitives (oauth2-patterns skill).
// - code_verifier: high-entropy random string (RFC 7636).
// - code_challenge: BASE64URL(SHA256(verifier)) — the S256 method (never `plain`).
// - state (CSRF) and nonce (replay) are independent high-entropy opaque values.
// All values are URL-safe base64 with no padding.

function base64Url(buf: Buffer): string {
  return buf.toString('base64url')
}

/** RFC 7636 code_verifier: 32 random bytes → 43-char base64url (within 43..128). */
export function generateCodeVerifier(): string {
  return base64Url(randomBytes(32))
}

/** S256 challenge derived from a verifier. */
export function codeChallengeS256(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier).digest())
}

/** Opaque anti-CSRF state value. */
export function generateState(): string {
  return base64Url(randomBytes(32))
}

/** Opaque anti-replay nonce (bound into the ID token). */
export function generateNonce(): string {
  return base64Url(randomBytes(32))
}

/**
 * Opaque session identifier for the cookie. Not a JWT, carries no PII, and is
 * never derived from user data — it is a lookup key into the server-side store.
 */
export function generateSessionId(): string {
  return base64Url(randomBytes(32))
}

/** Opaque key for the short-lived pre-auth (login→callback) transaction. */
export function generatePreAuthId(): string {
  return base64Url(randomBytes(32))
}

/**
 * Constant-time string comparison for security tokens (state, nonce). Avoids the
 * early-exit timing side channel of `===` when comparing attacker-influenced
 * values against a server secret (first-service precedent; oauth2-patterns skill).
 * Length is not itself secret here, but a length mismatch short-circuits to false
 * because `timingSafeEqual` requires equal-length buffers.
 */
export function timingSafeStrEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
