# PRD — Team To-Do App (MVP)

- **Status:** DRAFT — pending Gate 1 (PRD Review)
- **Author:** PM (orchestrator)
- **Date:** 2026-07-09
- **Risk tier:** **REGULATED** (compliance-determined: PII + WCAG 2.2 AA + OAuth2 auth)
- **Compliance scope:** IN — Privacy/PII, SOC 2, ISO 27001, NIST (reference), WCAG 2.2 AA. OUT — SOX, PCI.

## 1. Problem & goal
Teams need a shared, simple way to capture, organize, assign, and track tasks
together. Today that work scatters across chat, docs, and memory. Goal: a
collaborative, multi-user web to-do app where a team can manage shared lists of
tasks with due dates, priorities, and tags — accessible, secure, and reliable.

## 2. Target users
- **Team member:** creates/edits/completes tasks, is assigned work, organizes with lists/tags.
- **Team admin/owner:** creates a team, invites/removes members, manages shared lists.

## 3. In scope (MVP)
- **Accounts & auth:** sign up / sign in via OAuth2; user profile (name, email).
- **Teams:** create a team, invite members by email, membership roles (owner/member).
- **Lists/projects:** create shared lists within a team; tasks belong to a list.
- **Tasks (CRUD):** create, edit, mark complete/incomplete, delete; title + description.
- **Assignment:** assign a task to a team member.
- **Due dates & reminders:** set a due date; scheduled **in-app** reminder notification as due date approaches. (Email/other channels deferred post-MVP — approver decision at Gate 1.)
- **Tags:** label tasks; filter by tag.
- **Priorities & sorting:** priority levels (e.g. low/med/high); sort/filter by status, due date, priority, assignee.

## 4. Out of scope (MVP)
- Payments/billing (would pull in PCI — explicitly deferred).
- Real-time collaborative editing / presence; comments/attachments (unless trivial); mobile-native apps; recurring tasks; sub-tasks; calendar integrations.

## 5. Compliance / data-protection requirements (REGULATED — required at Gate 5)
These are first-class product requirements, not implementation details:
- **Multi-tenant data isolation:** a user in team A can never read/modify team B's data. (Top security-design risk; verified in TDD + security deep review.)
- **PII handling:** names/emails encrypted at rest (KMS) and in transit (TLS); no PII/secrets in logs, metrics, fixtures, or the audit trail (reference by id, not value).
- **PII deletion/erasure:** a user can request account/data deletion; a defined erasure path exists.
- **Retention:** a defined per-data-class retention policy, enforced.
- **Free-text handling:** task title/description are user free-text that may contain PII — handled under the PII regime; PRD position: permitted, treated as Confidential/PII.
- **OAuth2 secrets/tokens:** AWS key store only; never in git, logs, or fixtures.
- **WCAG 2.2 AA:** UI conforms to AA (keyboard nav, contrast, focus, labels, ARIA) — designer + frontend use the `accessibility-wcag` skill; conformance verified before Gate 5.

## 6. User stories & acceptance criteria (high level; expanded into Jira at Gate 4)
1. **Sign in** — As a user I can sign in with OAuth2 so my data is private to me.
   - AC: unauthenticated users cannot access any team data; session established via OAuth2; tokens stored server-side/secure.
2. **Create team & invite** — As an owner I can create a team and invite members by email.
   - AC: invited user joins only after accepting; only team members see team data (isolation).
3. **Manage lists** — As a member I can create/rename/delete shared lists in my team.
   - AC: lists scoped to team; deleting a list handles its tasks per defined rule.
4. **Task CRUD** — As a member I can create, edit, complete, and delete tasks.
   - AC: create requires a title; complete toggles state; delete removes it from the list; changes visible to all team members on refresh.
5. **Assign** — As a member I can assign a task to a teammate.
   - AC: assignee must be a team member; assignee can filter "my tasks".
6. **Due dates & reminders** — As a member I can set a due date and get a reminder.
   - AC: due date stored; a reminder notification is sent before the due time; no reminder after completion.
7. **Tags & filter** — As a member I can tag tasks and filter by tag.
8. **Priority & sort** — As a member I can set priority and sort/filter by status, due date, priority, assignee.
9. **Accessibility** — As a keyboard/screen-reader user I can perform all above flows.
   - AC: meets WCAG 2.2 AA for each flow.
10. **Delete my data** — As a user I can delete my account and associated personal data.

## 7. Success metrics
- **Activation:** % of invited users who create/complete ≥1 task within 7 days.
- **Engagement:** weekly active teams; tasks created/completed per active team per week.
- **Retention:** week-4 team retention.
- **Reliability (SRE-owned SLOs):** API availability ≥ 99.9%; p95 task-list load < 500 ms; reminder delivered within ±5 min of scheduled time.
- **Quality:** error rate < 0.5% of requests; zero cross-tenant data-access incidents.

## 8. Build budget (token estimate) — PM
- **Allocated:** 4,000,000 tokens
- **Hard cap:** 5,500,000 tokens (new subagent dispatch blocked beyond this until a human raises it)
- Rationale: regulated-tier, full 9-gate lifecycle, 4 feature areas, full-stack (backend + React frontend + migrations), with architect + security deep review + compliance attestation and expected review/rework loops. This is an estimate; **only a human can approve additional token use.**

## 9. AWS runtime cost estimate — DevOps (staging + production)
- **Staging:** ~$120/mo (single-AZ, scaled down)
- **Production:** ~$210/mo (Multi-AZ RDS, HA)
- **Combined:** ~$330/mo. **Recommend approving with ~10% buffer = $365/mo.**
- Region us-east-1, on-demand, priced 2026-07. Excludes third-party SaaS monitoring (Datadog/Sentry/Logz.io/Heap — billed outside AWS).
- **Cost levers flagged:** NAT Gateway (~$74/mo) replaceable with VPC endpoints; schedule staging shutdown off-hours (~50% staging savings); Savings Plans/RIs once steady.
- **Architecture note for the architect (Gate 3):** a serverless Lambda + API Gateway API could roughly halve compute cost (~$120–150/mo prod) vs the CLAUDE.md-default EC2 — a cold-start / RDS-pooling tradeoff to decide at architecture, not now.

## 10. Gate plan (Regulated tier)
Full 9-gate lifecycle + architect sign-off + security deep review + compliance
attestation + **dual human authorization** (Gate 6 deploy authorizer ≠ Gate 5 merge
approver). Gates 1/5/6/9 recorded to the hash-chained audit trail.

## 11. Open questions for approver
- Reminder channel for MVP: email, in-app, or both?
- Team size / scale expectations beyond "low thousands of users"?
- Any brand/design-system constraints for the designer?
