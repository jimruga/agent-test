# Compliance Attestation — S0/S1 pre-Gate 5

**Date:** 2026-07-13
**Frameworks:** Privacy/PII, SOC2, ISO 27001, NIST, WCAG 2.2 AA (backend scope)
**Scope:** REGULATED — touches personal data (PII: `users.email`, `display_name`, `invites.email`, `oauth_identities.provider_subject`; free-text PII in `tasks.title/description`, `notifications.payload`). SOX out (no financial-reporting data), PCI out (no cardholder data — billing explicitly deferred, PRD §4).
**all-green SHA:** a994e49b1e9f2a83ab6609b61c88e1f99e9a546c
**CI run:** https://github.com/jimruga/agent-test/actions/runs/29286915520/job/86941685260

**Status: ATTESTED WITH CONDITIONS**
*(C1 resolved by confirmed all-green; C2 reviewer re-verification dispatched; C3 advisory)*

---

## Evidence checklist

| # | Description | Status |
|---|---|---|
| 1 | Gate 1 CHANGE_AUTHORIZED in audit log | **PRESENT** — audit seq 1, `human:Jim`, `prd-todo-app`, `gate-1-prd`, hash `568e06…` |
| 2 | Gate 3 TOKEN_BUDGET_RAISED in audit log | **PRESENT** — audit seq 2, `human:Jim`, 4M→6M alloc / 5.5M→7M cap, TDD approved, Fastify ratified (ADR-0003), hash `b64ece…` |
| 3 | CONTROL_CHANGE_APPROVED ×2 (verify.sh tamper-check) | **PRESENT** — audit seq 3 (regex anchored) + seq 4 (test-file pathspec), both `human:Jim`; SoD noted (maker did not self-edit control) |
| 4 | Hash chain intact (SHA-256 prev_hash linkage) | **PRESENT / INTACT** — sanctioned verifier + independent check confirm GENESIS→1→2→3→4 with no gaps or reordering |
| 5 | Independent security review; F1 (nonce fail-closed) + F2 (PII-safe logs) resolved | **PRESENT (review); RE-VERIFICATION IN PROGRESS** — `workspace/security-review-s0-s1.md` complete; fixes applied and proven by all-green CI; re-verify pass dispatched (→ C2) |
| 6 | Gate-6 queue (F3–F9) tracked + deferred with rationale | **DEFERRED (proper)** — owners and conditions recorded; not pre-Gate-5 blockers |
| 7 | Independent code review; C1, W2, W3, W4 resolved | **PRESENT (review); RE-VERIFICATION IN PROGRESS** — `workspace/code-review-s0-s1.md` complete; fixes proven by all-green CI (W2 migration lane ✓, W4 integration lane ✓, C1 tsc clean ✓); re-verify pass dispatched (→ C2) |
| 8 | PII classification covers the 5 auth-slice migrations | **PRESENT / COMPLETE** — `data-plan §3.1` classifies every column in migrations 001-005 |
| 9 | Erasure / re-attribution specified (impl deferred) | **PRESENT (specified)** — PRD §5 + story 10; TDD §6.3/D3; data-plan §4 gives idempotent transactional operation; impl is Phase 7 (no PII stored in S0/S1 runtime yet) |
| 10 | Retention policy defined | **PRESENT (defined), ADVISORY C3** — `data-plan §3.2` sets windows per class; flagged as engineering defaults requiring assessor/legal confirmation |
| 11 | Multi-tenant isolation 3-layer design in TDD | **PRESENT (design)** — TDD §4: L1 server-derived TenantContext, L2 deny-by-default repository, L3 Postgres RLS GUC; RLS migration deferred to S2 (safe: no team-scoped surface in S1, routes flag-gated off) |
| 12 | audit-log.jsonl exists, readable, 4 records, chain intact | **PRESENT** — see item 4 |
| 13 | WCAG 2.2 AA acceptance criteria in PRD | **PRESENT (AC)** — PRD §5 + story 9; frontend conformance evidence deferred to the gate when UI ships; not a Gate-5 blocker for this backend-only slice |
| 14 | all-green CI signal (objective, not self-reported) | **CONFIRMED** — SHA a994e49b1e9f2a83ab6609b61c88e1f99e9a546c; run https://github.com/jimruga/agent-test/actions/runs/29286915520/job/86941685260 |

---

## Findings

Evidence framework is complete and sound: change-control authorizations in the hash-chained audit trail (intact), independent security and code reviews performed, PII classified per-column, erasure/retention/tenant-isolation specified with rationale, deferrals explicitly tracked to Gate 6 / S2 with owners. SoD holds on control changes. CI is now confirmed all-green on the pushed PR.

---

## Conditions

**C1 — Binding CI all-green: RESOLVED**
SHA a994e49b1e9f2a83ab6609b61c88e1f99e9a546c, run confirmed by human. W2 (migration apply/rollback lane), W4 (repo integration lane), C1 (tsc clean) proven by the green run.

**C2 — Reviewer re-verification: IN PROGRESS**
Security F1/F2 and code-review must-fixes were applied; re-verify passes dispatched in parallel. Gate 5 request waits on clean re-verify return.

**C3 — Retention-window assessor confirmation: ADVISORY**
`data-plan §3.2` windows (30/90/180/30 days) are engineering defaults. Confirm with org assessor/legal before real PII is stored. No S0/S1 data affected yet (purge-job classes are Phase-6 tables). Not a Gate-5 blocker.

**Gate-6 conditions (tracked, not Gate-5 blockers):**
F3 JWKS real verify, F4 Secrets Manager IAM, F5 Redis TLS/KMS/private, F6 RDS+column KMS, F7 app_runtime/app_migrator role split, F8 rate limiting, F9 security headers. Gate-6 deploy authorizer must differ from Gate-5 merge approver (regulated).

**Separate control gap (route to human):**
Budget-threshold hook not recording `used_tokens` — automatic hard-cap enforcement inactive; compensated by manual monitoring. SOC2 monitoring control degradation; not a Gate-5 blocker for this slice but warrants human awareness.

---

## Audit chain

- Records present: **yes** — 4 records, seq 1-4
- Chain intact: **yes** — GENESIS→568e06→b64ece→56e1b0→6e4daf, no gaps or reordering
- Gate-5 GATE_APPROVED (seq 5) will be recorded by PM at human approval

---

*Attested by compliance agent (read-only). Human Gate 5 approval is required before merge.*
