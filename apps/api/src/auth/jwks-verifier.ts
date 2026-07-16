// Real ID-token verification (F3, OWASP A07/A08). The signature, `iss`, `aud`, and
// `exp` checks are delegated to `jose`'s `jwtVerify` (verified against the provider
// JWKS); this helper adds required-claim extraction and fails CLOSED so an
// unverified or claim-incomplete token can never establish a session.
//
// Dependency inversion: `jwtVerify` and the JWKS key set are INJECTED rather than
// imported here, so this module carries no hard `jose` dependency and is fully
// unit-testable with no network/JWKS fetch. The composition root (index.ts) wires
// the real `jose` primitives. (software-design-patterns skill.)

import type { OAuthClaims } from './oauth-provider'

/**
 * The subset of a verified JWT payload we read. A superset of jose's `JWTPayload`
 * with the OIDC claims we consume typed explicitly; unknown claims are tolerated.
 */
export interface VerifiedIdTokenPayload {
  readonly sub?: unknown
  readonly email?: unknown
  readonly email_verified?: unknown
  readonly name?: unknown
  readonly nonce?: unknown
  readonly [claim: string]: unknown
}

/**
 * Structural subset of jose's `jwtVerify` that this module depends on. Kept as a
 * local type (not a `jose` import) so the helper stays dependency-free; the real
 * `jose.jwtVerify` is assignable to it at the wiring site.
 */
export type JwtVerifyFn = (
  token: string,
  keySet: unknown,
  options: { readonly issuer: string; readonly audience: string },
) => Promise<{ readonly payload: VerifiedIdTokenPayload }>

export interface JwksVerifierDeps {
  /** jose `jwtVerify` (or a fake in tests). */
  readonly jwtVerify: JwtVerifyFn
  /** Opaque JWKS key set — jose's `createRemoteJWKSet(...)` result. Passed through. */
  readonly keySet: unknown
  /** Expected token issuer (e.g. `https://accounts.google.com`). */
  readonly issuer: string
  /** Expected audience — the OAuth client id. */
  readonly audience: string
}

/**
 * Build a `verifyIdToken` function: verify the signature + `iss`/`aud`/`exp` via
 * jose against the JWKS, then extract the claims we trust. Any missing required
 * claim (or a jose verification failure) throws — never returns partial claims.
 */
export function buildJwksVerifier(
  deps: JwksVerifierDeps,
): (idToken: string) => Promise<OAuthClaims> {
  return async (idToken: string): Promise<OAuthClaims> => {
    const { payload } = await deps.jwtVerify(idToken, deps.keySet, {
      issuer: deps.issuer,
      audience: deps.audience,
    })

    const subject = payload.sub
    if (typeof subject !== 'string' || subject.length === 0) {
      throw new Error('id token verification failed: missing sub claim')
    }
    const email = payload.email
    if (typeof email !== 'string' || email.length === 0) {
      throw new Error('id token verification failed: missing email claim')
    }

    return {
      subject,
      email,
      // Absent or non-boolean-true means NOT verified (fail closed).
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      // Returned so the callback route can match it to the issued pre-auth nonce
      // (replay defense, F1). The route enforces the match; the verifier only surfaces it.
      nonce: typeof payload.nonce === 'string' ? payload.nonce : undefined,
    }
  }
}
