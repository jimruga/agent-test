# Security Review — F3/F8/F9 Security Hardening (REGULATED, required re-review pre-Gate-6)

- **Reviewer:** security agent (read-only)
- **Date:** 2026-07-15
- **Branch:** feature/f3-f8-f9-security-hardening (staged, not yet committed)
- **Mandate:** deploy plan `workspace/deploy-plan-s0-s1.md` requires security re-review of the real JWKS verifier before Gate 6.
- **Prior baseline:** S0/S1 review (2026-07-13) — F1 + F2 fixed. F4/F5/F6/F7 are devops-owned infra items not in scope here.
- **Overall:** JWKS verifier is well-built and correct. One new MUST-WIRE (F8-IP): missing `trustProxy` makes per-IP rate limiting non-functional behind ALB. F3 CLEAN. F9 CLEAN pending W2 fix.

Legend: **MUST-FIX (Gate 5)** · **MUST-WIRE (Gate 6)** · **TRACK**

---

## MUST-FIX before Gate 5

None. No new merge blockers.

---

## MUST-WIRE before Gate 6 — application → software-engineer

### F8-IP [MEDIUM] `req.ip` resolves to ALB IP — per-IP rate limiting non-functional in production

- **Files:** `apps/api/src/app.ts` (Fastify constructor, no `trustProxy`); `apps/api/src/auth/routes.ts:59` (`registerPreAuthAttempt(req.ip,...)`); `apps/api/src/platform/security.ts:44` (`@fastify/rate-limit` default key = `req.ip`)
- **Issue:** Without `trustProxy`, Fastify resolves `req.ip` to the immediate TCP connection IP — the ALB. Every client shares one rate-limit bucket and one pre-auth counter. The 100-req/5-min auth limit becomes a global counter; the 10-pre-auth bound fires after 10 total login attempts across all users, locking the entire auth flow until the window expires. Both F8 protections are neutralized in production.
- **Fix:** Add `trustProxy` to the Fastify constructor in `app.ts`:
  ```ts
  const app = Fastify({
    trustProxy: process.env.TRUSTED_PROXY_CIDR ?? 1, // 1 = trust one hop (the ALB)
    ...
  })
  ```
  Use ALB VPC private CIDR (e.g. `'10.0.0.0/8'`) or `1` (trust exactly one hop). Do NOT use `trustProxy: true` — makes `req.ip` fully spoofable via client X-Forwarded-For.
- **Owner:** software-engineer (`app.ts`); devops provides ALB CIDR / hop count.
- **Jira:** PM to file Bug / MEDIUM — "Auth rate limiting non-functional in production — missing `trustProxy` on Fastify init"
- **Security re-review required** after fix is applied.

---

## Code reviewer W1 + W2 — security assessment

### W1-SEC [LOW] Non-atomic incr+expire — operator-invisible DoS vector
A crash between the two Redis calls leaves a TTL-less key, permanently locking that IP out of the login flow until manually deleted. Timing-based exploitation is narrow but meaningful on a regulated service. Fully covered by code reviewer W1. Security concurs: fix before merge.

### W2-SEC [LOW] Helmet CSP `useDefaults: true` weakens emitted policy
`@fastify/helmet` merges `script-src 'self'` and other defaults into the declared `default-src 'none'` policy. No current exploitable path on a JSON-only API, but the header misrepresents the policy to auditors and any future non-JSON path inherits the loosened policy. Fully covered by code reviewer W2. Security concurs: add `useDefaults: false` before merge.

---

## F3 — JWKS verifier: CLEAN ✓

All deploy-plan questions answered affirmatively:
- **Signature + `iss`/`aud`/`exp`:** Delegated to injected `jwtVerify` with `issuer: 'https://accounts.google.com'` and `audience: config.oauth.clientId`. jose validates all automatically. CLEAN.
- **`iss` hardcoded:** `GOOGLE_ISSUER` constant in `index.ts`, not env-readable. CLEAN.
- **`aud` = clientId:** Sourced from `required(env, 'OAUTH_CLIENT_ID')` — throws at startup if absent. CLEAN.
- **`sub` missing/empty → fail closed:** `jwks-verifier.ts:62-64` throws. Tested. CLEAN.
- **`email` missing/empty → fail closed:** `jwks-verifier.ts:66-68` throws. Tested. CLEAN.
- **`email_verified: false` → no session:** Route rejects at `routes.ts:137-139` with 403. Tested. CLEAN.
- **JWKS key set cached:** `createRemoteJWKSet` called once at `buildProdDeps()`, reused. jose's internal LRU handles key rotation. CLEAN.
- **JWKS URL not config-injectable:** `GOOGLE_JWKS_URL` hardcoded constant in `index.ts`. CLEAN.
- **Nonce flow (F1 intact):** Verifier extracts nonce; route enforces fail-closed match at `routes.ts:131-136`. CLEAN.
- **SSRF:** Both JWKS URL and issuer are hardcoded constants. No user/config input. CLEAN.

---

## F8 — Rate limiting: MUST-WIRE (F8-IP above)

- Auth-route-only scope (`global: false`): CLEAN — `/ping` and `/api/me` unaffected. Tested.
- Pre-auth bound ordered before Redis write: CLEAN.
- 429 response safe (no stack trace, error-envelope shape): CLEAN.
- X-Forwarded-For spoofability: CLEAN once F8-IP fix uses scoped CIDR (not `trustProxy: true`).

---

## F9 — Security headers: CLEAN pending W2 fix ✓

- CSP intent (`default-src 'none'; frame-ancestors 'none'`): correct for JSON-only API. Emitted policy weakened by W2; resolved by `useDefaults: false`.
- HSTS: `maxAge = 15,552,000` (180 days), `includeSubDomains: true`. CLEAN.
- Headers apply to all routes including `/ping` (helmet `onSend` hook). Security tests confirm. CLEAN.

---

## TRACK

- **F3-NONCE-TRACK:** `buildJwksVerifier` does not accept an `expectedNonce` — nonce enforcement depends entirely on the route. Safe today. File S2 story to add optional `expectedNonce` to `JwksVerifierDeps`.
- **F8-FIXEDWINDOW-TRACK:** Fixed-window counter allows ~2× burst at window boundary. Known limitation; document in code comment. No code change required.

---

## Disposition

| Item | Status | Owner |
|------|--------|-------|
| F3 JWKS verifier | ✅ CLEAN | — |
| F8-IP trustProxy | ⛔ MUST-WIRE (Gate 6) | software-engineer + devops |
| W1 non-atomic incr | ⚠️ Fix before merge | software-engineer |
| W2 helmet useDefaults | ⚠️ Fix before merge | software-engineer |
| F9 security headers | ✅ CLEAN (pending W2) | — |
| F3-NONCE-TRACK | 📋 S2 story | PM |
| F8-FIXEDWINDOW-TRACK | 📝 doc comment | software-engineer |

NEXT: route to software-engineer — APP security finding(s): F8-IP MUST-WIRE + W1 + W2 (code reviewer concurred) | gate: none
