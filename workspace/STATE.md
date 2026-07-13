# STATE

> The PM keeps this current. Every subagent reads it first to orient.

- **Active feature:** Team To-Do App (MVP) — collaborative multi-user task management
- **Lifecycle phase:** architecture / technical design (Gate 2 APPROVED; working toward Gate 3 Tdd)
- **Lifecycle phase:** implementation (Gate 4 APPROVED; building S0+S1 test-driven, behind flag)
- **Current owner (agent):** HUMAN — Gate 6 (Infra Plan Review) requested. Deploy plan: workspace/deploy-plan-s0-s1.md
- **Gate 5 RESULT (human:Jim 2026-07-13):** PR APPROVED for merge. SHA a994e49b1e9f2a83ab6609b61c88e1f99e9a546c. CI run: https://github.com/jimruga/agent-test/actions/runs/29286915520/job/86941685260. Audit #5 GATE_APPROVED recorded.
- **⚠️ REGULATED: Gate 6 deploy authorizer MUST differ from Gate 5 approver (Jim).**
- **TOOLCHAIN UPGRADE DONE (Node ~26 / npm ~12):** engineer applied Node26/npm12 upgrade per ADR-0005. All CI failures from previous iterations fixed. Lockfile must be regenerated on linux with npm@12.0.1 (same 4-step no-Docker path, updated version strings). CI on Node 26 is the binding check.
- **Human steps (iter 9):** commit+push Node26/npm12 changes (package.json, .nvmrc, apps/api/package.json, ci.yml, ADR-0005) + regenerate lockfile locally (`rm -f package-lock.json && npm install`) + `git add package-lock.json` + commit+push → CI all-green. No docker, no linux required. Full notes in ci-toolchain-fix.md.
- **Control changes (audit #3, #4):** verify.sh tamper-check regex anchored + scoped to test-file diffs (human-approved).
- **Follow-ups (non-blocking):** openapi-ts config API reconcile at first gen:client; dependency-hygiene cleanup (@hey-api runtime-dep + fastify/vite misplacements).
- **REGRESSION:** all 3 manifests reverted to vite8/vitest4/openapi0.99 experiment + bogus `nvm@0.0.4` installed. CI(linux) fails on missing biome/rolldown linux native bindings (npm cross-platform optional-deps bug; vite8→rolldown). tamper+typecheck now pass.
- **Definitive fix DONE (engineer):** revert cause = stray `npm install nvm` mutated manifests, committed via 76a32a6 "sync lockfile" (NOT a git op — reflog clean). Restored 4 files (manifests + openapi-ts.config); removed nvm/allowScripts/misplaced deps; pinned vite5.4.21/vitest2.1.9/openapi-ts0.53.12-web-devDep. verify.sh untouched. No app logic changed.
- **Prevention:** lock-sync commits must show ZERO manifest diff; never casual `npm install <pkg>`; `nvm use` is a shell cmd.
- **Current owner (agent):** HUMAN (regen lock on linux + push, per workspace/ci-toolchain-fix.md).
- **CI toolchain simplified:** lockfile-guard job + regen-lockfile.yml removed (npm/cli#4828 cross-platform optional-dep bug resolved at Node 26 / npm 12). Lockfile now generated normally on any platform.
- **TOOLCHAIN UPGRADE (Node 26 / npm 12):** engineer applied on 2026-07-13 (ADR-0005). package.json engines/packageManager, .nvmrc, apps/api @types/node, ci.yml (4 jobs), regen-lockfile.yml all updated to Node26/npm@12.0.1. No app logic changed. PM decision: Node 26 pre-LTS accepted for dev/CI; Gate 6 deploy plan MUST confirm Active-LTS (2026-10-28) before production.
- **CI-greening loops: ~8 (all env/tooling, NOT feature defects; auth 65 tests/96% cov + tamper + typecheck green).** loop-guard: no agent thrash.
- **Reviews done + fixes applied:** security + code review returned; all must-fix items resolved & staged on feature/s0-s1-foundation-auth (C1 gitignore, W2 knex TS loader, F1/W3 nonce fail-closed, F2 PII-safe logs, W4 repo integration lane in all-green, + timingSafeEqual, CLAUDE.md versions). Not executed (no registry/node in sandbox) — CI is the verifier.
- **BLOCKED ON HUMAN:** commit branch + `npm install` (lockfile) + push + open PR → CI all-green (now incl. integration lane) → then pm runs compliance attestation → request Gate 5.
- **Deploy-time (Gate 6) queue:** JWKS real verify (eng), Secrets Manager IAM + Redis private/TLS/KMS + RDS/KMS + app_runtime role + rate limiting + edge headers (devops).
- **Deferred to S2:** redundant memberships index (data-eng), CSRF double-submit seam.
- **Clocktime baseline set:** O 175 / E 275 / P 455 engineer-hours (S0-S11).
- **S0/S1 status:** authored+staged on branch feature/s0-s1-foundation-auth; ADR-0004 (bootstrap). Must-wire before Gate 6: JWKS id-token verify (security), Secrets Manager resolver + ElastiCache (devops).
- **Gate 3 RESULT (human:Jim):** TDD APPROVED; API framework = **FASTIFY** (ADR-0003; api-conventions.md corrected Hono→Fastify in bootstrap PR); token budget raised to **6M alloc / 7M cap** (audit #2).
- **Gate 4 RESULT (human:Jim):** story backlog APPROVED (workspace/stories-todo-app.md): S0.1-0.3 + S1-S11.
- **Pending human gate:** 7 E2E Acceptance (after staging deploy + smoke suite green)
- **Gate 6 RESULT (human:JoeDoyle23 2026-07-13):** DEPLOY_AUTHORIZED. PR https://github.com/jimruga/agent-test/pull/1. SoD satisfied (JoeDoyle23 ≠ Jim). Audit #6 recorded.
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
