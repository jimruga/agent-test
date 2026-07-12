# STATE

> The PM keeps this current. Every subagent reads it first to orient.

- **Active feature:** Team To-Do App (MVP) — collaborative multi-user task management
- **Lifecycle phase:** architecture / technical design (Gate 2 APPROVED; working toward Gate 3 Tdd)
- **Lifecycle phase:** implementation (Gate 4 APPROVED; building S0+S1 test-driven, behind flag)
- **Current owner (agent):** software-engineer (applying review fix-batch before commit)
- **Reviews done:** security (workspace/security-review-s0-s1.md) + code review (workspace/code-review-s0-s1.md). Decision: FIX-THEN-COMMIT (C1/W2 would make CI red).
- **Fix batch (pre-merge):** C1 gitignore secrets.*; W2 knex TS loader; F1/W3 nonce fail-open; F2 PII-in-logs; W4 KnexUserRepository integration test; + timingSafeEqual, CLAUDE.md stack-line doc fix.
- **Deploy-time (Gate 6) queue:** JWKS verify (eng), Secrets Manager IAM + Redis private/TLS/KMS + RDS/KMS + app_runtime role + rate limiting + edge headers (devops).
- **Blocked on (after fixes):** HUMAN — commit branch + npm install (lockfile) + push + open PR → CI all-green → compliance attest → Gate 5.
- **Clocktime baseline set:** O 175 / E 275 / P 455 engineer-hours (S0-S11).
- **S0/S1 status:** authored+staged on branch feature/s0-s1-foundation-auth; ADR-0004 (bootstrap). Must-wire before Gate 6: JWKS id-token verify (security), Secrets Manager resolver + ElastiCache (devops).
- **Gate 3 RESULT (human:Jim):** TDD APPROVED; API framework = **FASTIFY** (ADR-0003; api-conventions.md corrected Hono→Fastify in bootstrap PR); token budget raised to **6M alloc / 7M cap** (audit #2).
- **Gate 4 RESULT (human:Jim):** story backlog APPROVED (workspace/stories-todo-app.md): S0.1-0.3 + S1-S11.
- **Pending human gate:** 5 PR Acceptance (requested only when PR all-green + independent review + compliance attestation)
- **Pending before Gate 5:** retention-window defaults → compliance; auth-table RLS → security deep review; clocktime baseline (from engineer).
- **PM-decided at Gate 3 (noted, not human gate):** list-name unique per team (case-insensitive); approve retention-purge scheduled job; accept metrics via Postgres rollups + Heap (no new pipeline). Routing retention-window defaults + auth-table RLS to compliance/security for sign-off before Gate 5.
- **⚠️ Control gaps to fix:** budget-threshold hook not recording used_tokens (auto hard-cap enforcement inactive → manual spend monitoring in place); missing clocktime baseline in budget.json (set before Gate 4).
- **Pending human gate:** 3 Tdd Review (next)
- **Gate 2 decisions (locked):** (1) delete list deletes its tasks; (2) sole-owner account deletion deletes the team (cascade, no transfer feature); (3) no realtime, manual refresh.
- **Build budget (tokens):** allocated 4,000,000 · used 0 · hard cap 5,500,000
- **Runtime budget (AWS/mo):** approved $365 (Gate 1)
- **PRD artifact:** workspace/prd-todo-app.md
- **✅ Audit trail:** Gate 1 CHANGE_AUTHORIZED recorded (audit #1, chain intact). Sandbox fixed via .claude/settings.local.json (allowRead: project root + CLT + user-Python; allowWrite: compliance/; env PYTHONHASHSEED=0 + PYTHONDONTWRITEBYTECODE=1).
- **Gate 1 decisions:** in-app reminders only; scale = default; brand = default (designer proposes)
- **Last updated:** 2026-07-09

## Scope (confirmed with requester)
- Team/collaborative, multi-user web app with accounts (OAuth2)
- MVP features: core task CRUD; due dates & reminders; lists/projects & tags; priorities & sorting/filtering
- Full lifecycle, all applicable human gates
- **Risk tier: REGULATED** (compliance-determined: PII + WCAG 2.2 AA + OAuth2 auth)
- Compliance IN scope: Privacy/PII, SOC2, ISO 27001, NIST, WCAG 2.2 AA. OUT: SOX, PCI.
- Must be PRD requirements (else missing evidence at Gate 5): PII deletion/erasure, per-class retention, multi-tenant data isolation (team A ≠ team B), free-text PII handling, WCAG 2.2 AA acceptance criteria
- Gate 6 deploy authorizer MUST differ from Gate 5 merge approver (regulated)
