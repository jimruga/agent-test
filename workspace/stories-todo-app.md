# Story Breakdown — Team To-Do App (MVP)

- **Status:** DRAFT — pending **Gate 4 (Story Review)**
- **Author:** pm
- **Date:** 2026-07-10
- **Epic:** Team To-Do App (MVP) — collaborative multi-user task management
- **Inputs:** PRD, UX spec, TDD (Fastify per ADR-0003), data-plan (migrations/RLS/retention/metrics)
- **Method:** tracer-bullet vertical slices (DB → API → UI, each independently shippable behind the `team_todo_mvp` flag, TDD throughout). Jira not connected → tickets drafted here for Jira sync.
- **Default tier:** REGULATED/High for anything touching auth, tenancy, or PII (most slices).

## Phase 0 — Foundation (High; blocks all slices)
- **S0.1 Monorepo + CI bootstrap** — scaffold `apps/api` (Fastify), `apps/web` (React+Vite), `packages/shared`; `openapi.yaml` + generate-client pipeline; `verify.sh` (lint/typecheck/test/coverage/anti-tamper); CI runs verify + migration apply/rollback; GitHub branch protection (`all-green` + independent review). **AC:** `make claude-check` green on an empty slice; branch protection active.
- **S0.2 Correct api-conventions.md Hono→Fastify** (ADR-0003 task) — update serve/test patterns to Fastify `app.inject()`. **AC:** doc matches ADR-0003; reviewed in PR.
- **S0.3 Feature-flag + kill-switch seam** — `team_todo_mvp` flag gating API route-registration/middleware + web feature barrel/route; register in `reliability/flags-registry.json`. **AC:** feature fully dark when flag off; kill switch verified.

## Vertical slices (each: migration + API + UI + tests, behind flag)
- **S1 Auth & session (High — auth)** — OAuth2 auth-code+PKCE; server-side token exchange; opaque HttpOnly/Secure/SameSite cookie; Redis session store; secrets by ARN. **Tracer:** sign in → land on empty home; sign out; expired-session redirect. **AC:** maps PRD Story 1; tokens never reach client; OWASP checks.
- **S2 Teams & tenant-isolation foundation (High — tenancy, TOP RISK)** — create team; `team_id` on rows; server-derived tenant context; deny-by-default scoped repository; Postgres RLS (txn-local GUC); 403==404. **Tracer:** create team → empty team home scoped to that team. **AC:** PRD Story 2 (create); **cross-tenant negative-test kit (7 cases incl. pooled-connection bleed) passes.**
- **S3 Invites & membership** — invite by email (owner only, role-gated UI); accept-before-access; pending/member status. **AC:** PRD Story 2 (invite/accept); invite alone never grants access.
- **S4 Lists CRUD** — create/rename/delete; **delete cascades its tasks** (Gate-2 rule) with counted confirmation. **AC:** PRD Story 3.
- **S5 Tasks CRUD** — create (title required), edit (detail panel), complete/incomplete, delete + 5s undo; visible-on-refresh (no realtime). **AC:** PRD Story 4.
- **S6 Assignment** — assignee combobox = current team members only. **AC:** PRD Story 5; assignee must be team member; "My Tasks" per-team filter.
- **S7 Due dates & in-app reminders** — due date field; reminder scan (Lambda/eb-worker, EventBridge); notification bell/tray + non-modal toast persisting to tray; no reminder after completion. **AC:** PRD Story 6.
- **S8 Tags, priority, sort/filter** — tag chips (create/remove), 3-level priority (icon+text+color), filter bar + sort control with aria-live. **AC:** PRD Stories 7–8.
- **S9 Account & data deletion (High — PII erasure)** — two-step confirm; PII hard-erase; **sole-owner deletion cascades the team** (Gate-2 rule) with member-impact warning; "Deleted user" sentinel re-attribution; retention/purge job. **AC:** PRD Story 10 + PRD §5 erasure/retention.
- **S10 WCAG 2.2 AA conformance & a11y tests** — per-slice a11y built-in + a dedicated verification story: axe-core in component/e2e; manual keyboard + screen-reader passes on sign-in, invite, task CRUD, assign, reminders, deletion. **AC:** PRD Story 9; AA verified before Gate 5.
- **S11 Progressive delivery & observability** — canary→ramp config, SLOs/error budget (SRE), metrics instrumentation (**Gate 8 approval required first**), dashboards. **AC:** PRD success metrics captured ids-only (no PII).

## Dependencies (build order)
S0 → S1 → S2 → {S3, S4} → S5 → {S6, S7, S8} → S9 → S10 (cross-cutting, finalized late) → S11 (deploy/observe). WIP limit 2 concurrent slices once contract is frozen (backend then frontend per slice).

## Compliance evidence attached per slice (Regulated)
Tenant-isolation negative tests (S2 + every data slice), PII-in-logs check, secrets-by-ARN check, WCAG AA (S10), audit records at Gates 5/6/9. Compliance attests before Gate 5.

## Open (set at Gate 4 / before Gate 5)
- Clocktime estimate (optimistic/expected/pessimistic) to seed `budget.json.clocktime`.
- Retention-window default values → compliance sign-off.
- Auth-table (users/oauth_identities/sessions) RLS → security deep review.
