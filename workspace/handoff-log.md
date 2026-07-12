# Handoff log (append-only)

> One line per handoff, decision, conflict resolution, and human approval.
> Format: `<timestamp> | <from> -> <to> | <summary> | gate: <none|human:...> | <approved-by?>`

<!-- examples
2026-06-03T10:00 | human -> pm | new feature: saved-search alerts | gate: none |
2026-06-03T11:20 | pm -> human | PRD ready for review | gate: human:gate-1-prd | APPROVED by Jim
2026-06-03T14:05 | qa-engineer -> software-engineer | BUG-412 null token on refresh | gate: none |
-->

2026-07-09 | human -> pm | new feature: Team To-Do App (MVP) — collaborative multi-user, CRUD + due dates/reminders + lists/tags + priorities; full lifecycle | gate: none |
2026-07-09 | pm -> devops-engineer | requested AWS runtime cost estimate (staging + prod) for PRD | gate: none |
2026-07-09 | pm -> compliance | requested scope determination | gate: none |
2026-07-09 | compliance -> pm | scope done: tier REGULATED (PII + WCAG + OAuth2); IN Privacy/SOC2/ISO27001/NIST/WCAG, OUT SOX/PCI; flagged PII deletion, retention, multi-tenant isolation, free-text PII, WCAG AC as PRD requirements | gate: none |
2026-07-09 | devops-engineer -> pm | AWS runtime estimate: staging ~$120 + prod ~$210 = ~$330/mo (recommend $365 w/ buffer); flagged serverless alt for architect | gate: none |
2026-07-09 | pm -> human | PRD ready: workspace/prd-todo-app.md; token budget 4M (cap 5.5M); AWS $330/mo ($365 w/ buffer) | gate: human:1 PRD Review | APPROVED by Jim (AWS $365, in-app reminders only, scale+brand defaults)
2026-07-09 | pm -> AUDIT-GAP | audit-append.sh + compliance/ blocked by sandbox (Operation not permitted); CHANGE_AUTHORIZED for Gate 1 NOT written to hash-chained log. MUST be recorded (fix perms / human runs hook) before Gate 5. | gate: none |
2026-07-09 | pm -> RESOLVED | sandbox permissions fixed (human approved): .claude/settings.local.json grants allowRead [project root, CLT framework, user-Python], allowWrite [compliance/], env PYTHONHASHSEED=0 + PYTHONDONTWRITEBYTECODE=1. Gate 1 CHANGE_AUTHORIZED written to audit-log.jsonl (#1); --verify chain intact. loop-guard runs clean. | gate: none |
2026-07-09 | pm -> product-designer | design phase (Gate 2) dispatched | gate: none |
2026-07-09 | product-designer -> pm | UX spec + WCAG-AA mocks ready; 3 open design questions | gate: human:2 Design Review |
2026-07-09 | pm -> human | Gate 2 design summary presented w/ recommendations | gate: human:2 Design Review | APPROVED by Jim (1: delete tasks with list; 2: delete the team on sole-owner acct deletion; 3: no realtime)
2026-07-09 | pm -> architect | architecture phase: produce/refresh codebase-map.md (brownfield), rule on EC2-vs-serverless, set patterns for TDD | gate: none |
2026-07-09 | architect -> pm | codebase-map.md refreshed (hybrid: brownfield conventions, greenfield code — NO app code exists yet); ADR-0002 compute: EC2+ALB for sync API (default), Lambda/eb-worker for async reminder scan — rejects serverless hot path (cold-start vs p95<500ms SLO, RDS pooling); flagged Hono-vs-Fastify contradiction to resolve in TDD; coherence constraints for TDD listed (tenant isolation, OAuth2 server-side tokens, cascade-delete/erasure, flag/kill-switch seams) | gate: none |
2026-07-09 | pm -> software-engineer | author TDD (workspace/tdd-todo-app.md): resolve Hono-vs-Fastify, API contract, data model, tenant isolation, OAuth2 server-side tokens, cascade-delete/erasure, flag/kill-switch, impl plan | gate: none |
2026-07-09 | software-engineer -> pm | TDD ready (workspace/tdd-todo-app.md); recommends ADOPT HONO (ADR-0003, human ratifies); data model ready for data-engineer; FLAGGED: ~5.6M token estimate at/over 5.5M cap; UX §4/§10.4 stale (now reconciled by pm) | gate: human:3 Tdd Review |
2026-07-09 | pm -> spend | forecast token build-budget vs 4M alloc / 5.5M cap for Gate 3 | gate: none |
2026-07-09 | pm -> data-engineer | migration + RLS + retention + metrics plan (workspace/data-plan-todo-app.md) for Gate 3 | gate: none |
2026-07-09 | pm -> BUDGET-HOOK-GAP | budget.json used_tokens still 0 after many subagent runs; budget-threshold hook may not be recording/enforcing. Investigate + flag to human at Gate 3. | gate: none |
2026-07-09 | spend -> pm | forecast: build ~5.6-6.7M tokens > 4M alloc (~40% over) and at/over 5.5M cap; drivers compliance-mandated (tenancy tests, PII erasure, WCAG); recommend raise; flagged missing clocktime baseline | gate: human:token-overage |
2026-07-09 | data-engineer -> pm | data plan ready (migrations 001-014 fwd+rollback, cascade rules, RLS defense-in-depth, classification+retention, metrics plan [Gate 8], test datasets); 5 open items (list-name uniqueness, purge-job scope, auth-table RLS, metrics dest, retention windows) | gate: human:3 Tdd Review |
2026-07-09 | pm -> human | Gate 3 package presented (TDD + data plan + ADRs + spend forecast) | gate: human:3 Tdd Review | APPROVED by Jim
2026-07-09 | human:Jim -> pm | Gate 3 decisions: TDD APPROVED; API framework=FASTIFY (override Hono rec, ADR-0003); token budget raised 4M/5.5M -> 6M/7M | gate: human:token-overage | APPROVED (audit #2)
2026-07-09 | pm -> DECIDED | PM defaults: list-name unique per team (ci); approve retention-purge job; metrics via Postgres rollups + Heap. Routing retention-window defaults -> compliance, auth-table RLS -> security (before Gate 5). api-conventions.md Hono->Fastify correction = bootstrap PR task. | gate: none |
2026-07-09 | pm -> (self) fictiv-to-stories | breaking epic into tracer-bullet vertical-slice stories for Gate 4 Story Review | gate: none |
2026-07-09 | pm -> human | Gate 4 story backlog presented (workspace/stories-todo-app.md: S0.1-0.3 + S1-S11) | gate: human:4 Story Review | APPROVED by Jim
2026-07-11 | pm -> software-engineer | implement S0 (foundation) + S1 (auth & session) test-driven, behind team_todo_mvp flag; report lockfile/sandbox blockers + clocktime estimate | gate: none |
2026-07-11 | software-engineer -> pm | S0.1/S0.2/S0.3 + S1 authored on branch feature/s0-s1-foundation-auth (staged, NOT committed — `git commit` is permission-denied in this env, needs human). npm-workspaces monorepo (apps/api Fastify+TS, apps/web React skeleton, packages/shared), OpenAPI contract, verify.sh/CI repointed to monorepo, api-conventions.md Hono->Fastify (ADR-0003 task done), team_todo_mvp flag+kill-switch seam (registry updated), OAuth2 auth-code+PKCE server-side tokens + opaque HttpOnly/Secure/SameSite session cookie + Redis-seam session store + /me + logout. Tests authored (not executed: no npm-registry network) — CI verify.sh is the verifier. BLOCKED on: (1) human/CI `npm install` to generate lockfile, (2) human commit, (3) data-engineer auth-table migrations in same PR. Must-wire before deploy: JWKS id-token verify (security), Secrets Manager resolver (devops). Clocktime S0-S11 = O ~175 / E ~275 / P ~455 engineer-hours (workspace/impl-notes-s0-s1.md). | gate: none |
2026-07-11 | data-engineer -> pm | migrations 001-005 (extensions, users+Deleted-user sentinel, oauth_identities, teams-minimal, memberships) authored to migrations/ on same branch, staged (human must commit); sessions table deferred (no consumer); RLS on memberships/teams deferred to S2 GUC seam; users/oauth/sessions RLS to security review. Not applied (CI verifies). | gate: none |
2026-07-11 | pm -> security | REGULATED deep security review of S0/S1 auth + migrations (workspace/security-review-s0-s1.md) | gate: none |
2026-07-11 | pm -> code-reviewer | code review of S0/S1 slice + migrations (workspace/code-review-s0-s1.md) | gate: none |
2026-07-11 | pm -> HUMAN-ACTION-BLOCKER | Gate 5 needs green CI; env denies git commit + npm install. Human must commit branch feature/s0-s1-foundation-auth, run npm install (lockfile), push, open PR; then CI all-green -> compliance attest -> Gate 5. | gate: none |
2026-07-11 | security -> pm | deep review (workspace/security-review-s0-s1.md): auth well-built; 2 MUST-FIX pre-Gate-5 (F1 nonce fail-open, F2 PII-in-error-logs → software-engineer); 7 must-wire pre-Gate-6 (F3 JWKS eng; F4/F5/F6/F7/F9 devops; F8 both); RLS deferrals acceptable w/ conditions; migrations clean | gate: none |
2026-07-11 | code-reviewer -> pm | REQUEST CHANGES (workspace/code-review-s0-s1.md): C1 CRITICAL .gitignore secrets.* drops source→CI red; W2 knex TS-loader missing; W3 nonce fail-open (=F1); W4 prod KnexUserRepository untested; nits (redundant idx→data-eng, timingSafeEqual, CLAUDE.md stack line). Tamper check clean. | gate: none |
2026-07-11 | pm -> software-engineer | FIX BATCH before commit/Gate 5: C1 gitignore, W2 knex loader, F1/W3 nonce, F2 PII logs, W4 repo integration test, + timingSafeEqual & CLAUDE.md stack-line doc fix; deploy-time (Gate 6) items tracked separately | gate: none |
2026-07-11 | pm -> DECISION | Go/no-go = fix-then-commit (do NOT commit now; C1/W2 would land a red PR). Defer redundant-index nit + S2/S4 seams to S2. | gate: none |
