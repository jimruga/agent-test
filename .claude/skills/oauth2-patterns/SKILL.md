---
name: oauth2-patterns
description: OAuth2 / OIDC flows and token handling for API design, frontend auth, and security review. Use whenever authentication or authorization is designed, implemented, or reviewed. Shared by the software engineer, frontend engineer, and security agent.
---

# OAuth2 / OIDC patterns

## Choosing a flow
- Web/SPA and mobile: **Authorization Code + PKCE**. Do not use the implicit flow.
- Service-to-service: **Client Credentials**.
- Never put client secrets in browser or mobile bundles; SPAs use PKCE without a secret.

## Token handling
- Prefer short-lived access tokens (minutes) + rotating refresh tokens.
- Browser: keep tokens out of `localStorage`; use secure, `HttpOnly`, `SameSite` cookies or in-memory access tokens with a refresh path. Guard against XSS and CSRF accordingly.
- Validate on the API: signature, `iss`, `aud`, `exp`, and required scopes/claims on every request. Don't trust unvalidated JWTs.
- Enforce least-privilege scopes; separate read and write scopes.

## Hardening
- Always TLS. Use `state` (CSRF) and `nonce` (replay) on the auth request.
- Exact-match redirect URIs; reject wildcards.
- Support token revocation and sensible session expiry/idle timeout.
- Centralize authz checks server-side; never rely on the client to hide privileged actions.
