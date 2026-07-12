# Code Review — S0/S1 Foundation + Auth (pre-Gate-5, static)

- **Reviewer:** code-reviewer (persisted by pm — reviewer is read-only)
- **Branch:** feature/s0-s1-foundation-auth (staged, uncommitted) · **Date:** 2026-07-11
- **Verification:** static/pre-commit only; binding all-green CI still pending human commit/CI.
- **Tamper check:** CLEAN — no .only/.skip/xit/xdescribe/.todo; no tests deleted; verify.sh anti-tamper intact.
- **Verdict:** REQUEST CHANGES — 1 Critical (blocks CI), then re-review.

## CRITICAL — must fix before merge
- **C1** `.gitignore:12` pattern `secrets.*` silently ignores `apps/api/src/platform/secrets.ts` + `secrets.test.ts` (confirmed via `git check-ignore`). index.ts imports it → fresh CI checkout: tsc fails → verify red; also violates CLAUDE.md "never reference gitignored files"; secrets seam gets no CI evidence (regulated gap); permanent landmine for the paved road. FIX: narrow pattern to credential files (secrets.json/yaml, *.secrets.*, .secrets/) or rename module; ensure both files committed. Owner: software-engineer (+ devops on the gitignore convention precedent).

## WARNINGS — should fix before merge
- **W2** Migration apply/rollback lane likely fails: Knex CLI has no TS loader (`.ts` knexfile + ESM; only `tsx` devDep, not wired). CI `migrations` job is the binding migration proof → must actually run. FIX: wire ts-node or `node --import tsx`. Owner: software-engineer; data-engineer confirms lane exercises 001-005 both directions.
- **W3** Nonce replay bypass when ID token omits nonce (`routes.ts:91`) — same as security F1. FIX: require nonce present + match; add nonce-absent negative test. Owner: software-engineer.
- **W4** Prod `KnexUserRepository` has zero test coverage (excluded from unit lane; migrations job only does DDL). Real DB read/write path unverified while in-memory fake turns green. FIX: add integration test against CI's postgres:16 (create-on-first-login, idempotent by provider+subject, getWithMemberships join, active-only filter). Owner: software-engineer + data-engineer fixtures.

## SUGGESTIONS
- **S1(nit)** migrations/005: `t.unique(['team_id','user_id'])` already indexes; the explicit `t.index(['team_id','user_id'])` is redundant — drop it (keep `user_id` index). Owner: data-engineer (defer to next migration touch / S2).
- **S2** state/nonce compare non-constant-time; use crypto.timingSafeEqual as first-service precedent (cheap). Owner: software-engineer.
- **S3** CLAUDE.md stack pins unattainable/divergent (TS ~7.0.2, Node ~26.5.0 don't exist; Fastify/Knex versions off). ADR-0004 records reconciliation — correct the CLAUDE.md stack line so future agents don't chase phantom versions. Owner: software-engineer/PM (doc).
- **S4** double-submit CSRF token seam must land with S2's first mutating team endpoint (S1's only mutation is logout, Lax-protected). Track for S2.

## Solid (for audit)
Clean DI seams; transport/logic/persistence separation; buildApp+app.inject per ADR-0003; tokens server-side only (asserted); PKCE S256; state/expiry tested; /me fails closed on erased user; migrations have real forward+down, explicit ON DELETE, indexed FKs, partial-unique active email, UUIDv7, PII-free sentinel; named-exports-only enforced; flag-off=404 proven.
