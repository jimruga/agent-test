# Code Review — F3/F8/F9 Security Hardening (pre-commit, staged)

- **Reviewer:** code-reviewer (read-only)
- **Branch:** feature/f3-f8-f9-security-hardening (staged, not yet committed)
- **Date:** 2026-07-15
- **Files reviewed:** 14 (apps/api/package.json, src/auth/jwks-verifier.ts + test, src/platform/security.ts + test, src/index.ts, src/app.ts, src/deps.ts, src/auth/routes.ts + test, src/auth/session-store.ts + test, src/auth/oauth-provider.test.ts, src/testing/build-test-app.ts)
- **Prior review baseline:** all S0/S1 findings (C1, W2–W4) confirmed fixed at SHA a994e49; no pre-existing issues re-raised here.
- **Verification:** pre-commit, static only. CI has not yet run; this recommendation is contingent on the `all-green` check being green (branch protection enforces it).
- **Tamper check:** CLEAN — no `.only`, `.skip`, `xit`, `xdescribe`, or deleted tests. All new tests are additive.
- **Verdict:** REQUEST CHANGES — 2 Warnings before merge.

---

## CRITICAL — must fix before merge

None.

---

## WARNINGS — should fix before merge

### W1 — `incr` + `expire` non-atomic in `registerPreAuthAttempt` — permanent IP lockout on crash

**File:** `apps/api/src/auth/session-store.ts:85-91`

```ts
const count = await this.redis.incr(key)
if (count === 1) {
  await this.redis.expire(key, windowSeconds)
}
```

`incr` and `expire` are two separate Redis round-trips. If the process crashes (OOM kill, restart, deploy rollover) in the window between them, the counter key at `preauth-count:<ip>` persists in Redis with **no TTL**. On every subsequent login attempt from that IP, `incr` returns 2, 3, … which will always exceed `maxPerWindow`. The user is permanently locked out of the login flow from that IP until the key is manually deleted from Redis.

The probability is low (a specific crash window), but the consequence is a persistent, operator-invisible DoS of a legitimate user's IP address. For a security-hardening PR, this is the correct place to address it.

**Fix:** Replace the two-command sequence with an atomic pipeline or a Lua script. Using an ioredis pipeline:

```ts
async registerPreAuthAttempt(
  ip: string,
  maxPerWindow: number,
  windowSeconds: number,
): Promise<boolean> {
  const key = PRE_AUTH_COUNT_PREFIX + ip
  const count = await this.redis.incr(key)
  if (count === 1) {
    await this.redis.expire(key, windowSeconds)
  }
  return count <= maxPerWindow
}
```

The minimal fix is to always call `expire` (not only on the first increment); this makes the window sliding rather than fixed, but eliminates the lockout risk. The preferred fix is `SET key 0 EX ttl NX` before the first `incr`, which keeps the fixed-window semantics. Either way, `RedisLike` may need a new method, or this can use a Lua script via a raw ioredis `eval` call (behind a new interface method).

**Owner:** software-engineer (session-store logic); data-engineer to verify the ioredis adapter change if the `RedisLike` interface changes.

---

### W2 — Helmet CSP directives merged with defaults — `script-src 'self'` leaks through

**File:** `apps/api/src/platform/security.ts:28-33`

```ts
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'none'"],
    frameAncestors: ["'none'"],
  },
},
```

`@fastify/helmet` wraps the standalone `helmet` package. In helmet 8.x (the version wrapped by `@fastify/helmet` ~13), `contentSecurityPolicy` defaults to `useDefaults: true`, which **merges** the supplied directives with helmet's built-in defaults rather than replacing them. The built-in defaults include `scriptSrc: ["'self'"]`, `styleSrc: ["'self'", 'https:', "'unsafe-inline'"]`, `fontSrc`, `imgSrc`, etc.

The net CSP emitted is therefore:
```
default-src 'none';
frame-ancestors 'none';
script-src 'self';          ← from helmet defaults, overrides default-src for scripts
style-src 'self' https: 'unsafe-inline'; ← same
...
```

In CSP, a specific directive (`script-src`) always overrides `default-src` for its resource type. The developer's intent — a fully locked-down `default-src 'none'` — is partially undermined: scripts from the same origin are allowed. For a pure JSON API serving only `application/json`, browsers will not execute these responses as scripts, so there is no immediate attack surface. However:
- The header misrepresents the actual policy to a security auditor or scanner.
- If the API ever serves a non-JSON response path, the loosened policy applies immediately.
- Future maintainers reading the code will believe the policy is stricter than it is.

**Fix:**

```ts
contentSecurityPolicy: {
  useDefaults: false,
  directives: {
    'default-src': ["'none'"],
    'frame-ancestors': ["'none'"],
  },
},
```

`useDefaults: false` tells helmet-csp to emit only the directives you specify, not the merged set. The result is the minimal, maximally strict policy: `default-src 'none'; frame-ancestors 'none'`.

**Owner:** software-engineer

---

## SUGGESTIONS

### S1 — Deferred nonce-in-verifier should be tracked as a Jira ticket

**Files:** `apps/api/src/auth/routes.ts:130`, `apps/api/src/auth/jwks-verifier.ts`

The comment at routes.ts:130 (`"Ideally the JWKS verifier also binds the nonce; see impl-notes"`) describes a genuine defense-in-depth gap: today the nonce is matched at the route layer, not inside the JWKS verifier. The verifier therefore surfaces the nonce as an optional field, and the security guarantee depends on routes.ts enforcing the match. This is functional (the match IS enforced, W3 was fixed in S0/S1), but binding the nonce inside `buildJwksVerifier` would make the security property self-contained — the route layer couldn't accidentally be edited to skip the check. File a Jira story; this is a clean follow-on for S2.

### S2 — `/me` is the only auth route without a route-level rate limit

**File:** `apps/api/src/auth/routes.ts`

`login`, `callback`, and `logout` all carry `{ config: { rateLimit: AUTH_RATE_LIMIT } }`. The `/me` route does not. An unauthenticated `/me` returns 401 immediately (no Redis/DB hit, no PII), so the practical risk is low. Including it in the `AUTH_RATE_LIMIT` group would make the policy consistent and protect against accidental session-enumeration attacks in a future endpoint change.

### S3 — Fixed-window counter boundary vulnerability is undocumented

**File:** `apps/api/src/auth/session-store.ts:87` (existing comment)

The comment correctly notes the fixed-window behavior. A well-known property of fixed-window rate counters is that an attacker who times requests to straddle two windows can send 2× the per-window limit (e.g. 10 at t=599s, 10 at t=601s = 20 in 2 seconds). This is acceptable here because the per-IP counter is a secondary control (the edge `@fastify/rate-limit` provides the primary bound), but it should be documented as a known limitation so a future maintainer doesn't assume the window is sliding.

### S4 — Ping non-rate-limit test fires 150 requests (minor slowdown)

**File:** `apps/api/src/platform/security.test.ts:50-53`

The test fires 150 inject calls to prove `/ping` is never rate-limited. Since `@fastify/rate-limit global: false` means the limiter only activates on routes with `config.rateLimit`, 15-20 requests prove the same thing. Reducing this speeds up the CI suite without reducing assertion strength.

---

## Solid (for audit)

- **JWKS verifier DI pattern is correct.** `jwtVerify` and `keySet` are injected, not imported; the verifier has no hard `jose` dependency and is fully unit-testable with no network or JWKS fetch. All fail-closed paths exercised: missing `sub`, missing `email`, absent `email_verified`, jose verification failure — all throw or return the correct defensive value.
- **`global: false` on rate-limit is the right choice.** Only routes that opt in via `config.rateLimit` are limited; `/ping` is confirmed free by test.
- **Pre-auth bound ordered correctly.** `registerPreAuthAttempt` is called before `putPreAuth` — the bound is enforced before any Redis write, so a rejected request creates no dangling state.
- **Backward-compatible `RedisLike` interface extension.** `incr` is additive; `InMemoryRedis` implements it; the ioredis adapter wires it; all existing tests using `InMemoryRedis` are unaffected.
- **Three new deps correctly pinned with `~`.** `jose ~5.9.0`, `@fastify/rate-limit ~10.2.0`, `@fastify/helmet ~13.0.0` all use minor-range pins as required.
- **`registerSecurityPlugins` is optional in `AppDeps`.** `deps.registerSecurityPlugins?.(app)` — the unit test suite leaves it undefined; the real plugins run only in the opt-in security tests and production. Correct pattern.
- **Pre-auth counter tests are thorough.** Four tests cover: per-IP max, window TTL reset, IP independence (in session-store.test.ts) and the route-level 429 (in routes.test.ts).
- **`verifyIdToken` throw propagation test added to oauth-provider.test.ts.** An unverified token never returns claims — OWASP A08 assertion is now machine-checked.
- **No default exports introduced.** All new modules export named symbols only.
- **No secrets or PII in new code.** Error messages name claim *types* (`"missing sub claim"`) not claim *values*. Rate-limit message exposes only the retry delay. PII-safe log path from error-envelope.ts covers the new throw paths.
- **`rate_limited` maps to HTTP 429** confirmed in `platform/error-envelope.ts:15` — the pre-auth bound and edge-limiter rejection both use the shared envelope.

---

## Re-verification required before Gate 5

CI (`all-green`) must be green on the commit SHA before Gate 5 is requested. The binding checks are: typecheck, lint, unit tests (coverage thresholds), integration lane, tamper check. This review clears the static pass; CI is the verifier.

---

NEXT: route to software-engineer — review changes requested (Critical: 0, Warnings: 2: W1 non-atomic incr+expire lockout risk, W2 helmet CSP useDefaults merging) | gate: none
