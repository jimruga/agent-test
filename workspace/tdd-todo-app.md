# Technical Design Document — Team To-Do App (MVP)

- **Status:** APPROVED at **Gate 3 (Tdd Review)** by human:Jim, 2026-07-09. Design only; no production code.

> **Gate 3 ratifications (human:Jim, 2026-07-09) — supersede the TDD's D1 recommendation:**
> - **API framework = FASTIFY** (not Hono). CLAUDE.md stack line + PRD stand; the TDD's D1 "adopt Hono" recommendation is OVERRIDDEN. Recorded as **ADR-0003**. ACTION: `.claude/rules/api-conventions.md` must be corrected from Hono to Fastify serve/test patterns (`app.inject()` in-process testing, contract-first toolchain) during Phase-0 bootstrap, reviewed in the first PR. All §2 REST resource design remains valid (framework-agnostic).
> - **Token build budget raised** to allocated 6,000,000 / hard cap 7,000,000 (§8.1 estimate approved with rework buffer).
> - TDD approved to proceed to Gate 4 (Story Review).
- **Author:** software-engineer
- **Date:** 2026-07-09
- **Risk tier:** REGULATED (PII + WCAG 2.2 AA + OAuth2)
- **Inputs:** PRD `workspace/prd-todo-app.md`; UX spec `workspace/ux-spec-todo-app.md`
  (Gate 2 decisions RESOLVED); ADR-0002 (compute model); `workspace/codebase-map.md`;
  `.claude/CLAUDE.md` + `.claude/rules/*`.
- **Precedent weight:** this is the platform's **first service**. Every decision here
  becomes the paved road, so contradictions are resolved explicitly (not silently) and
  routed for human ratification.
- **Downstream owners:** the **data model (§3)** is the input the **data-engineer**
  authors migrations against; the **API contract (§2)** becomes `apps/api/openapi.yaml`
  (contract-first); the **flag (§7)** is registered by whoever lands the first slice.

---

## 0. Decisions requiring human ratification at Gate 3

| # | Decision | Recommendation | Where |
|---|---|---|---|
| D1 | **Hono vs Fastify** (codebase-map backlog #1) | **Adopt Hono**; correct the one-line CLAUDE.md/PRD stack mention. Record as ADR-0003. | §1 |
| D2 | Server-side OAuth2 session store | **Redis (ElastiCache)** for sessions + short-lived provider tokens; opaque cookie. | §5 |
| D3 | Erasure asymmetry vs retention | Hard-erase author PII; **re-attribute** shared-list task authorship to a sentinel "Deleted user". | §6 |
| D4 | Postgres RLS as defense-in-depth | **Yes**, in addition to the app-layer scoped repository (belt-and-suspenders). | §4 |
| D5 | ID strategy | **UUIDv7** surrogate PKs (sortable, non-guessable) everywhere. | §3 |

None of these are self-approved. The PM surfaces them at Gate 3; the human ratifies.

---

## 1. RESOLVE: Hono vs Fastify (D1)

### The contradiction
- `.claude/rules/api-conventions.md` prescribes **Hono 4**, run under `tsx`, with the
  **contract-first `openapi.yaml`** source of truth and the **in-process
  `app.request('/api/...')`** test pattern (exported `app` instance, thin `index.ts`).
- `.claude/CLAUDE.md` stack one-liner and PRD §-nothing-specific say **Fastify ~5.10**.
- `workspace/codebase-map.md` flags this as the highest-risk item (backlog #1) and
  ADR-0002 defers it ("resolve the Hono-vs-Fastify contradiction first").

### Recommendation: **adopt Hono**; fix the stray Fastify mention.

Rationale (this sets platform precedent, so weigh coherence heavily):

1. **Depth of the convention beats a one-liner.** `api-conventions.md` is a detailed,
   path-scoped rule that hard-codes a *test architecture* — the exported `app` +
   `app.request()` in-process pattern, extensionless ESM, `tsc --noEmit` build. That
   pattern is Hono-native (`app.request()` is a Hono API). The Fastify reference is a
   single orientation line with no supporting convention, test pattern, or skill behind
   it. Changing one line is cheap; rewriting the entire test/serve convention corpus and
   every future engineer's mental model is expensive and error-prone.
2. **ADR-0002 already leans Hono.** It describes the API as "a long-running served
   `app` instance" — the `api-conventions.md` shape. No part of the accepted compute ADR
   depends on Fastify.
3. **`make claude-gen-client` and the whole contract-first toolchain** (`@hey-api/openapi-ts`,
   the `@/lib/api` shim, the generated-client hook) are described against the Hono
   convention. Keeping Hono keeps that toolchain coherent on day one.
4. **Feature parity for our needs.** Both are Node/TS REST servers. Nothing in the PRD
   (OAuth2, REST, Knex/RDS, rate limiting, WAF-fronted) needs a Fastify-only capability.
   Hono's middleware model covers auth, CORS, rate-limit, and error-envelope cleanly.
5. **Lowest blast radius.** The correction is: edit the CLAUDE.md stack line
   `Fastify ~5.10.0` → `Hono ~4.x`, and note it in the PRD. Everything else already
   assumes Hono.

**If the human instead ratifies Fastify** at Gate 3, the cost is real and must be owned:
rewrite `api-conventions.md` (serve/test pattern), re-point the codegen shim, and lose
the in-process `app.request()` ergonomics (Fastify uses `app.inject()` — similar but a
different convention to document). I do **not** recommend this, but I flag it so the
choice is informed.

**Action if ratified as Hono:** author **ADR-0003 (API framework = Hono, contract-first)**
in `docs/adr/`, and the one-line CLAUDE.md correction lands in the same PR as the first
API slice.

---

## 2. API contract (REST, contract-first → `apps/api/openapi.yaml`)

**Conventions honored:** all paths mount under `/api`; every request/response shape a
web client consumes is defined in `openapi.yaml`, then `make claude-gen-client`
regenerates `apps/web/src/client/` (never hand-edited); operational endpoints like
`/ping` stay out of the contract. OAuth2 (authorization-code + PKCE) secures everything;
**tokens are server-side only** (§5) — the SPA holds only an opaque session cookie.

### 2.1 Cross-cutting API design rules (precedent-setting)

- **Resource-oriented URLs, correct verbs.** `GET` (safe/cacheable), `POST` (create),
  `PATCH` (partial update — default for edits), `PUT` (full replace, rarely), `DELETE`.
- **Team-scoped resources are nested** under the team to make tenancy explicit in the
  contract *and* the code: `/api/teams/{teamId}/lists/...`. `teamId` is validated against
  the caller's membership server-side on **every** request (§4) — the nesting is
  ergonomic, **not** the security boundary.
- **Status codes:** `200` ok, `201` created (+ `Location`), `204` no content (deletes),
  `400` validation, `401` unauthenticated, `403`/`404` **identical bodies** for
  cross-tenant (§4, UX §9), `409` conflict (e.g. duplicate invite), `422` semantic
  validation, `429` rate-limited, `5xx` server.
- **Consistent error envelope:**
  `{ "error": { "code": "string", "message": "human text", "details": [ ... ] } }`.
  Never leak stack traces, SQL, or existence of other tenants' rows.
- **Pagination:** **keyset** (cursor) pagination for task/list collections
  (`?limit=50&cursor=<opaque>`), returning `{ items, nextCursor }`. Avoids offset drift
  and is index-friendly (§3). No unbounded list endpoints.
- **Filtering/sorting** via query params, whitelisted server-side:
  `?status=&assigneeId=&tagId=&priority=&dueBefore=&sort=dueDate|priority|status|assignee|createdAt&dir=asc|desc`.
  Unknown params → `400` (no silent ignore — prevents filter-bypass surprises).
- **Versioning:** header-light for MVP — the contract is versioned via the `openapi.yaml`
  `info.version`; breaking changes get a `/api/v2` prefix later. Documented so the
  precedent exists.
- **Idempotency for unsafe retries:** `POST` create endpoints accept an optional
  `Idempotency-Key` header; the server stores the key→result for a TTL so a retried
  create doesn't double-insert (matters for invite sends and task quick-add).
- **Rate limiting** middleware (per-session + per-IP) in front of auth and write paths;
  WAF at the ALB is the outer layer (ADR-0002 / devops).

### 2.2 Endpoints

**Auth / session (OAuth2 authorization-code + PKCE):**
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/auth/login?provider=google&returnTo=` | Start auth-code flow; server sets `state`+`nonce`+PKCE verifier, 302 to provider. |
| `GET` | `/api/auth/callback?code=&state=` | Exchange code server-side, create session, set cookie, 302 to `returnTo` (validated allowlist). |
| `POST` | `/api/auth/logout` | Revoke session + provider token; clear cookie; `204`. |
| `GET` | `/api/me` | Current user profile + memberships (drives the team switcher). `401` if no session. |

**Teams:**
| `POST` | `/api/teams` | Create team; caller becomes `owner`. `201`. |
| `GET` | `/api/teams` | Teams the caller belongs to (never all teams). |
| `GET` | `/api/teams/{teamId}` | Team detail (member-scoped). |
| `PATCH` | `/api/teams/{teamId}` | Rename (owner only). |
| `DELETE` | `/api/teams/{teamId}` | Delete team + cascade (owner only) — §6. |

**Memberships / invites:**
| `GET` | `/api/teams/{teamId}/members` | Roster (drives assignee picker — §4/§6 UX). |
| `DELETE` | `/api/teams/{teamId}/members/{userId}` | Remove member (owner only). |
| `POST` | `/api/teams/{teamId}/invites` | Create invite(s) by email (owner only); `Idempotency-Key`. |
| `GET` | `/api/teams/{teamId}/invites` | Pending invites (owner only). |
| `DELETE` | `/api/teams/{teamId}/invites/{inviteId}` | Revoke invite (owner only). |
| `POST` | `/api/invites/{token}/accept` | Invitee accepts (token-scoped, email must match session) → membership created. Access granted **only** here (PRD AC). |

**Lists:**
| `POST` | `/api/teams/{teamId}/lists` | Create list. |
| `GET` | `/api/teams/{teamId}/lists` | List lists (keyset). |
| `PATCH` | `/api/teams/{teamId}/lists/{listId}` | Rename. |
| `DELETE` | `/api/teams/{teamId}/lists/{listId}` | Delete list → **cascade its tasks** (Gate-2 rule §6). |

**Tasks (+ assignment, due dates, priorities):**
| `POST` | `/api/teams/{teamId}/lists/{listId}/tasks` | Create (title required; optional description/assignee/dueAt/priority/tags); `Idempotency-Key`. |
| `GET` | `/api/teams/{teamId}/tasks` | Cross-list team task query with filter/sort/keyset (drives list view, My Tasks, filters). |
| `GET` | `/api/teams/{teamId}/lists/{listId}/tasks` | Tasks in one list. |
| `GET` | `/api/teams/{teamId}/tasks/{taskId}` | Task detail. |
| `PATCH` | `/api/teams/{teamId}/tasks/{taskId}` | Edit any field; `assigneeId` must be a current team member (`422` otherwise, UX §6 error path); toggling `completedAt` cancels pending reminder (§6). |
| `DELETE` | `/api/teams/{teamId}/tasks/{taskId}` | Delete task (`204`). Soft-delete window is a **client** 5s undo (UX §5); server delete is immediate on confirm. |

**Tags:**
| `GET` | `/api/teams/{teamId}/tags` | Team tag vocabulary (autocomplete). |
| `POST` | `/api/teams/{teamId}/tags` | Create tag (unique per team, case-insensitive). |
| `PUT` | `/api/teams/{teamId}/tasks/{taskId}/tags` | Set the task's tag set (replace semantics; server upserts join rows). |
| `DELETE` | `/api/teams/{teamId}/tags/{tagId}` | Delete tag (removes joins). |

**Notifications / reminders (in-app, pull-based — no realtime, Gate-2):**
| `GET` | `/api/notifications?unread=true&cursor=` | Notification tray (current user, current-team-scoped). |
| `POST` | `/api/notifications/{id}/read` | Mark read (dismiss). |
| `POST` | `/api/notifications/{id}/snooze` | Snooze 1h (UX §7) — reschedules reminder. |

> Reminder **creation** is not a request-path endpoint: the EventBridge→Lambda scan
> (ADR-0002) finds tasks due soon and writes `notification` rows; the client polls
> `GET /api/notifications` on refresh/interval. Delivery is pull, per Gate-2.

**Account deletion (PII erasure):**
| `DELETE` | `/api/me` | Delete account + PII erasure + sole-owner team cascade (§6). Two-step confirm is UX; the server requires a fresh re-auth/confirmation token. |

---

## 3. Domain + data model (input for the data-engineer's migrations)

**Conventions:** AWS RDS PostgreSQL via **Knex**; 3NF; **UUIDv7** surrogate PKs (D5 —
sortable, non-guessable, no enumeration); `timestamptz` everywhere (never naive);
integrity pushed into the DB (`NOT NULL`, FK with explicit `ON DELETE`, unique, check);
**every team-owned row carries `team_id`** (redundant on deep rows on purpose — it is
what the scoped repository and RLS filter on, §4). PII columns are marked and encrypted
at rest via KMS (§5). Money: n/a. Closed sets use Postgres enums or check constraints.

> The data-engineer owns the actual migration authoring, ordering, and rollback. This is
> the target schema they build to; column-level choices below are recommendations to
> refine with them, not final DDL.

### 3.1 Entities

**`users`** — a person.
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK (v7) | |
| `email` | citext UNIQUE NOT NULL | **PII** — encrypted at rest; citext for case-insensitive uniqueness |
| `display_name` | text NOT NULL | **PII** |
| `avatar_initials` | text | derived; no external image (UX §12) |
| `status` | enum(`active`,`deleted`) NOT NULL default `active` | soft state for the erasure sentinel (§6) |
| `created_at`/`updated_at` | timestamptz NOT NULL | |
| `deleted_at` | timestamptz NULL | set on erasure |

There is **one reserved sentinel user row** `status='deleted'`, `display_name='Deleted user'`,
`email` nulled/tombstoned — used to re-attribute shared-list tasks (§6, D3).

**`oauth_identities`** — provider linkage (an account may link >1 provider later).
| `id` uuid PK · `user_id` uuid FK→users ON DELETE CASCADE · `provider` text NOT NULL
(`google`,…) · `provider_subject` text NOT NULL (`sub` claim) · `created_at` timestamptz.
UNIQUE(`provider`,`provider_subject`). **No tokens stored here** — tokens live in the
server-side session store (§5), not the DB.

**`sessions`** — server-side session index (see §5; the hot store is Redis, this table is
the durable/audit record if we choose DB-backed sessions).
| `id` uuid PK · `user_id` uuid FK→users ON DELETE CASCADE · `created_at` · `expires_at`
timestamptz · `idle_timeout_at` timestamptz · `revoked_at` timestamptz NULL ·
`ip`/`user_agent` (operational, treat as low-sensitivity, not marketing).

**`teams`** — the tenant.
| `id` uuid PK · `name` text NOT NULL · `created_by` uuid FK→users · `created_at`/`updated_at` ·
`deleted_at` timestamptz NULL.

**`memberships`** — user↔team with role.
| `id` uuid PK · `team_id` uuid FK→teams ON DELETE CASCADE · `user_id` uuid FK→users
ON DELETE CASCADE · `role` enum(`owner`,`member`) NOT NULL · `created_at`.
UNIQUE(`team_id`,`user_id`). This table **is the authorization source** for §4.

**`invites`** — pending membership.
| `id` uuid PK · `team_id` uuid FK→teams ON DELETE CASCADE · `email` citext NOT NULL
(**PII**) · `role` enum default `member` · `token_hash` text NOT NULL (store a **hash** of
the invite token, never the raw token) · `status` enum(`pending`,`accepted`,`revoked`,`expired`) ·
`invited_by` uuid FK→users · `created_at` · `expires_at` timestamptz.
UNIQUE(`team_id`,`email`) WHERE `status='pending'` (partial unique → one live invite per email/team; UX §3 "already a member/invited").

**`lists`** — shared list within a team.
| `id` uuid PK · `team_id` uuid FK→teams ON DELETE CASCADE NOT NULL · `name` text NOT NULL ·
`created_by` uuid FK→users · `created_at`/`updated_at`.
UNIQUE(`team_id`, lower(`name`)) optional (dedupe list names per team — confirm w/ PM).

**`tasks`** — the core entity.
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK (v7) | |
| `team_id` | uuid FK→teams ON DELETE CASCADE NOT NULL | denormalized tenancy key (§4) |
| `list_id` | uuid FK→lists **ON DELETE CASCADE** NOT NULL | Gate-2: list delete → tasks delete (§6) |
| `title` | text NOT NULL CHECK (length 1..500) | **free-text PII** (PRD §5) |
| `description` | text NULL | **free-text PII** |
| `assignee_id` | uuid FK→users ON DELETE SET NULL NULL | must be a team member (enforced app-layer + trigger, §4) |
| `created_by` | uuid FK→users ON DELETE SET NULL | re-pointed to sentinel on erasure (§6) |
| `priority` | enum(`low`,`med`,`high`) NULL | |
| `due_at` | timestamptz NULL | |
| `completed_at` | timestamptz NULL | null = open; toggling cancels reminders (§6) |
| `created_at`/`updated_at` | timestamptz NOT NULL | |

**`tags`** — per-team label vocabulary.
| `id` uuid PK · `team_id` uuid FK→teams ON DELETE CASCADE NOT NULL · `name` text NOT NULL ·
`color_token` text NULL (UX token, not raw hex) · `created_at`.
UNIQUE(`team_id`, lower(`name`)).

**`task_tags`** — join (M:N).
| `task_id` uuid FK→tasks ON DELETE CASCADE · `tag_id` uuid FK→tags ON DELETE CASCADE ·
`team_id` uuid NOT NULL (carried for RLS/scoping). PK(`task_id`,`tag_id`).

**`reminders`** — scheduled intent for a task.
| `id` uuid PK · `team_id` uuid NOT NULL · `task_id` uuid FK→tasks ON DELETE CASCADE ·
`remind_at` timestamptz NOT NULL · `status` enum(`scheduled`,`fired`,`cancelled`,`snoozed`) ·
`created_at`. The scan (§ADR-0002) reads `scheduled` rows where `remind_at <= now()` and
task `completed_at IS NULL`, emits notifications, flips to `fired`.

**`notifications`** — delivered in-app item (per recipient user).
| `id` uuid PK · `team_id` uuid NOT NULL · `user_id` uuid FK→users ON DELETE CASCADE
(recipient) · `task_id` uuid FK→tasks ON DELETE CASCADE · `type` enum(`reminder`) ·
`payload` jsonb (denormalized task title/dueAt for tray display; **contains free-text PII**) ·
`read_at` timestamptz NULL · `created_at`.

### 3.2 Indexes (measure with `EXPLAIN ANALYZE`; these are the query-shape starting set)
- `memberships (user_id)` and `memberships (team_id, user_id)` — the authz hot path (§4).
- `tasks (team_id, list_id, completed_at, due_at)` — list view + due sort.
- `tasks (team_id, assignee_id)` — "My Tasks".
- `tasks (team_id, priority)`, `tasks (team_id, created_at)` — sort options.
- Keyset-friendly composite on the default sort (`team_id, due_at, id`).
- `task_tags (tag_id)` and `task_tags (team_id, tag_id)` — filter by tag.
- `reminders (status, remind_at)` — the scan's read (partial index WHERE `status='scheduled'`).
- `notifications (user_id, read_at, created_at)` — tray query.
- `invites (token_hash)` unique; partial unique on live invites (above).
- FK columns all indexed (Knex won't auto-create these).

### 3.3 PII inventory (feeds §5/§6 and compliance evidence)
| Class | Columns |
|---|---|
| Direct PII (encrypt at rest) | `users.email`, `users.display_name`, `invites.email` |
| Free-text PII (Confidential) | `tasks.title`, `tasks.description`, `notifications.payload` |
| Low-sensitivity operational | `sessions.ip`, `sessions.user_agent` |
| Never stored | OAuth access/refresh tokens (session store only), invite raw token (hash only), secrets |

---

## 4. Multi-tenant isolation (top security risk)

Defense-in-depth, deny-by-default, at three layers. **No endpoint trusts a client-supplied
`teamId` as proof of access.**

### 4.1 Layer 1 — server-derived tenant scope
On every authenticated request, middleware loads the caller's memberships from the session
(§5) and builds a `TenantContext { userId, allowedTeamIds, roleByTeam }`. The `{teamId}` in
the URL is **checked against `allowedTeamIds`**; not a member → the request never reaches
business logic. This is derived **server-side from membership**, never from the token/cookie
claims a client could forge.

### 4.2 Layer 2 — scoped repository / query layer (the primary enforcement)
All persistence goes through a **scoped repository** (dependency-inverted, per the
design-patterns skill). The repo is constructed with the `TenantContext`; **every query it
issues auto-injects `WHERE team_id = $ctx.teamId`**. There is **no** un-scoped query path in
application code — the raw Knex handle is not exported from the data layer. This makes the
safe path the only path (make illegal states unrepresentable):
- Reads: filtered by `team_id`; a row from another team is simply not returned.
- Writes: `team_id` is set from the context, not the request body — a client cannot write a
  row into another tenant.
- Assignee validation: `assignee_id` must appear in `memberships` for that `team_id`
  (checked in the repo + a DB check/trigger as backstop) → UX §6 error path.

### 4.3 Layer 3 — Postgres Row-Level Security (D4, defense-in-depth)
Enable **RLS** on every team-owned table with a policy `team_id = current_setting('app.team_id')::uuid`.
The connection/transaction sets `app.team_id` (and `app.user_id`) from the `TenantContext`
via Knex before running scoped queries. If an app-layer bug ever forgets a `WHERE`, RLS
still denies cross-tenant rows. The migration app+rollback (CI) must cover the RLS policies.
> Trade-off noted for the data-engineer: RLS + a warm pooled connection (ADR-0002) requires
> setting the GUC per-transaction (or per-checkout) so a pooled connection never leaks one
> tenant's setting to the next request. This is a known pattern; call it out in the migration
> + repo review.

### 4.4 403 == 404 (UX §9)
Cross-tenant access to a known-id resource returns a body **identical** to a not-found:
same status family and same envelope, so an attacker cannot distinguish "exists but forbidden"
from "does not exist" (no existence oracle). Internally we log which it was (for audit) but the
response is uniform. Documented as the platform convention.

### 4.5 Cross-tenant negative tests QA must run (precedent test suite)
These are **required** (regulated) and become the reusable tenancy test kit:
1. User in team A `GET`/`PATCH`/`DELETE` a team B list/task/tag/member/invite by id → 404-shaped.
2. User in team A creates a task with body `team_id` = team B → ignored; row lands in A (or 400).
3. `assignee_id` set to a user who is in team B but not team A → `422`.
4. `GET /api/teams` for user A never returns team B; `GET /api/notifications` never returns B's.
5. Accept-invite with a token for team B while authenticated as a non-invited A user → denied.
6. RLS enforced even if the repo `WHERE` is bypassed (test hitting a deliberately un-scoped
   query in a test-only harness proves Layer 3 independently).
7. Pooled-connection tenant-bleed test: two sequential requests for different tenants on the
   same connection return only their own rows (proves the GUC reset).

---

## 5. OAuth2 server-side token handling (D2)

Per the `oauth2-patterns` and `secrets-management` skills, and PRD §5 (tokens never touch
the client).

### 5.1 Flow — Authorization Code + PKCE
1. `GET /api/auth/login` → server generates `state` (CSRF), `nonce` (replay), and PKCE
   `code_verifier`/`code_challenge`; stashes them in the pre-auth session; 302 to the
   provider with an **exact-match** redirect URI (no wildcards).
2. Provider → `GET /api/auth/callback`. Server validates `state`, exchanges `code`
   **server-side** for tokens, validates the ID token (`iss`, `aud`, `exp`, `nonce`,
   signature), upserts `users`+`oauth_identities`, creates a server-side session, sets the
   session cookie, 302 to a **validated** `returnTo`.
3. Access/refresh tokens are held **server-side only** (never serialized to the SPA). The
   API authorizes requests off the **session**, not a client-held JWT.

### 5.2 Session cookie + store
- Cookie: **opaque session id** (not a JWT, no PII), `HttpOnly`, `Secure`, `SameSite=Lax`
  (Lax so the OAuth redirect GET carries it; write endpoints additionally require a
  CSRF token / double-submit since Lax allows top-level GET). `Path=/`, host-only, short
  `Max-Age` with idle + absolute timeout.
- **Store: Redis (ElastiCache)** — session record + short-lived provider access token +
  rotating refresh token, keyed by session id, with TTL = idle timeout; absolute expiry
  enforced separately. This is the codebase-map's "first justification" for Redis. The
  `sessions` table (§3) is the optional durable/audit mirror; Redis is the hot path.
- **Revocation:** `POST /api/auth/logout` and account deletion delete the Redis session and
  revoke the provider refresh token. Idle + absolute session expiry enforced server-side.

### 5.3 Secrets (by ARN, never value — `secrets-management`)
OAuth **client secret**, session signing/pepper, and KMS **key ARN** for PII encryption live
in **AWS Secrets Manager / SSM SecureString**, read at runtime via the EC2 instance role /
Lambda execution role (ADR-0002). Code and CloudFormation reference **ARNs / dynamic refs**,
never literals. Nothing sensitive in git, logs, fixtures, or the audit trail (PRD §5). PII
columns (§3.3) are encrypted with KMS; the app handles the key by ARN.

### 5.4 OWASP top-10 coverage checklist (verified before Gate 5)
A01 Broken access control → §4 (deny-by-default scoping + RLS + 403==404).
A02 Crypto failures → TLS everywhere; PII + tokens encrypted; opaque cookie.
A03 Injection → Knex parameterized queries only; no string SQL; input validated at the edge.
A04 Insecure design → this TDD + threat surface in §4/§5.
A05 Misconfig → WAF/rate-limit/private subnets (devops); secure cookie flags.
A06 Vulnerable components → CI SCA/SBOM before Gate 5.
A07 Auth failures → OAuth2 + PKCE, `state`/`nonce`, session expiry/rotation, revocation.
A08 Integrity failures → signed/validated ID token; idempotency keys; no hand-edited generated code.
A09 Logging/monitoring → Sentry/Datadog/Logz.io; **no PII in logs** (ids not values); audit trail.
A10 SSRF → provider metadata/redirect URIs are exact-match allowlisted; no user-supplied URLs fetched.

---

## 6. Cascade-delete + PII erasure logic

Two Gate-2 rules plus the erasure asymmetry, reconciled with retention (PRD §5).

### 6.1 List delete → cascade its tasks (Gate-2 decision 1, UX §4)
`tasks.list_id` FK is `ON DELETE CASCADE`. Deleting a list removes its tasks, their
`task_tags`, `reminders`, and `notifications` (all `ON DELETE CASCADE` off `task_id`).
UX shows the counted confirmation ("Delete '[List]' and its N tasks?"). Wrapped in a
transaction so it's all-or-nothing.

### 6.2 Sole-owner account deletion → cascade team (Gate-2 decision 2, UX §10)
`DELETE /api/me` logic, in one transaction:
1. For each team where the caller is a member:
   - If caller is the **sole owner** → **delete the team** (cascade removes memberships,
     lists, tasks, tags, invites, reminders, notifications). Other members lose access
     (UX confirmation states this). No ownership-transfer feature in MVP.
   - If the team has **other owners** → just remove the caller's membership; the team
     survives.
2. Then apply erasure (§6.3) to the caller's `users` row.
3. Destroy all of the caller's sessions (Redis + `sessions`), revoke provider tokens.

> Note: UX §10's *original* text (block + require transfer) is **superseded** by the
> resolved Gate-2 decision 2 (cascade-delete the team). The confirmation copy in UX §10.1
> already matches the resolved behavior; the §10.4 "block" error path does not apply for the
> sole-owner case and should be dropped when the frontend is built. Flagged for the PM to
> reconcile the UX doc.

### 6.3 Erasure asymmetry vs retention (D3, UX §10.1)
The tension: privacy requires **hard-erasing the person's PII**, but shared-list tasks the
person authored are **team records** other members still rely on — deleting them would be
data loss for the team. Resolution:
- **Hard-erase** the caller's direct PII: `users.email`, `users.display_name`,
  `oauth_identities`, sessions, and any `notifications` addressed to them → deleted/nulled.
  `users.status='deleted'`, `deleted_at` set (the row is tombstoned, not physically removed,
  so FKs stay valid).
- **Re-attribute, don't delete, shared content:** tasks the user `created_by` in **shared
  team lists that survive** are re-pointed to the reserved **"Deleted user" sentinel**
  (§3.1). `assignee_id` on their tasks → `SET NULL` (becomes "Unassigned", UX §6). The task
  *content* (title/description) is team free-text and is retained as a team record; the
  *authorship link to a real person* is severed.
- **Retention reconciliation:** the per-class retention policy (compliance/data-engineer
  owns the actual schedule) is: direct PII erased on request (no retention beyond the
  request); team task content retained per the team-records retention class, de-identified
  of the departing author. This is the asymmetry made explicit and defensible — the person's
  identity is gone; the team's shared work is preserved but no longer attributed to them.
- This must be an **idempotent, transactional** operation with an audit-trail entry
  (`PII_ERASURE`, referencing user **id**, never PII value).

---

## 7. Feature-flag / kill-switch seams

Per the `feature-flags-progressive-delivery` skill and CLAUDE.md progressive-delivery
rules. **One flag** gates the whole feature across both tiers so deploy is decoupled from
release and there's an instant off-switch.

- **Flag:** `team_todo_mvp` — type `release`, evaluated **server-side** (AppConfig or an
  OpenFeature provider), default `false`.
- **API seam:** flag gates **route registration + the auth/tenant middleware chain** for the
  `/api/teams/**`, `/api/notifications`, and account-deletion routes. Off → routes are not
  registered (404), so the feature is truly dark; `/api/auth/*` and `/api/me` may register
  independently so a canary cohort can be admitted.
- **Web seam:** flag gates the **feature barrel** (`apps/web/src/features/team-todo/index.ts`)
  and its **route tier** (the authenticated shell routes) — the client only *reflects* the
  server decision (never client-side security gating).
- **Kill switch:** flipping `team_todo_mvp` off (ops flag) instantly removes the routes +
  UI without a deploy — the first incident lever (ahead of rollback). Flag-flip events are
  audit-logged (kill-switch flips are material).
- **Rollout:** deploy dark → internal/canary → 1% → 10% → 50% → 100%, watching the p95
  task-list-load and error-rate SLIs (PRD §7) with auto-halt on breach (sre sets guardrails
  at Gate 6/7).
- **Registry:** add to `reliability/flags-registry.json` with `owner`, `default:false`,
  `rollout`, `kill_switch:true`, `created`, and an **expiry** (flags without owner+expiry are
  rejected; remove once 100% stable). *Registered by the engineer landing the first slice —
  not created yet (design phase).*

---

## 8. Implementation plan (phased, test-driven, tracer-bullet slices)

**Discipline:** TDD red→green per the `tdd` skill; **vertical slices** (one seam → one test →
minimal impl), not horizontal (no writing all tests first). Seams are agreed **before** each
slice: the API seam is `app.request('/api/...')` (Hono, per §1); the repo seam is the scoped
repository interface; the tenant seam is `TenantContext`. Every endpoint gets a happy-path
**and** a failure/validation test (api-conventions). `./verify.sh` / `make claude-check`
green at each step; CI's migration apply+rollback + `all-green` is the binding gate. **No
test tampering** (no delete/`.skip`/`.only`). Migrations are authored by the **data-engineer**
and land in the **same PR** as the code that depends on them.

**Phase 0 — Paved-road bootstrap (codebase-map backlog #2, human/CI-run).**
Monorepo scaffold (`package.json`, `npm-workspace.yaml`, `turbo.json`), empty
`apps/api/openapi.yaml`, `docs/adr/` (+ ADR-0003 framework), `verify.sh`, CI (verify +
migration apply/rollback + branch protection), Vitest/Playwright/axe harness. **Lockfile
cannot be regenerated in the Claude sandbox (no registry network)** — a human/CI runs the
initial install. This unblocks everything.

**Phase 1 — Tracer bullet: auth + one tenant-scoped read (proves the spine end-to-end).**
OAuth2 login/callback/session (§5), `TenantContext` middleware + scoped repo skeleton (§4),
RLS on one table, `GET /api/me`, `POST /api/teams`, `GET /api/teams`. Includes the first
cross-tenant negative test. This slice proves auth → tenancy → DB → contract → generated
client work together before breadth.

**Phase 2 — Teams, memberships, invites** (§2 invite flow incl. accept-only-grants-access AC).
**Phase 3 — Lists + list-delete cascade** (§6.1) + Task CRUD (create/edit/complete/delete).
**Phase 4 — Assignment + due dates + priorities** (assignee-must-be-member validation).
**Phase 5 — Tags + filter/sort/keyset pagination.**
**Phase 6 — Reminders scan (EventBridge→Lambda, ADR-0002) + notifications tray endpoints.**
**Phase 7 — Account deletion + PII erasure + sole-owner team cascade** (§6.2/§6.3) — highest
compliance stakes, done last with dedicated tests + audit-trail entry.
**Cross-cutting throughout:** the flag seam (§7), rate limiting, error envelope, and the
tenancy negative-test kit (§4.5) grow with each slice; WCAG axe tests ride with the frontend.

### 8.1 Token build-estimate sanity check (vs PRD 4M allocated / 5.5M cap)
Rough order-of-magnitude, this-agent's-view estimate (the PM owns the budget; this is a
sanity check, not a re-budget):

| Bucket | Rough tokens |
|---|---|
| This TDD + Gate-3 iteration | ~0.15M |
| Phase 0 bootstrap + CI/verify | ~0.3M |
| Phases 1–5 backend (7 resource areas, TDD, review/rework loops) | ~1.6M |
| Reminders/notifications + Lambda scan (Phase 6) | ~0.35M |
| Account deletion/erasure (Phase 7, high-care) | ~0.3M |
| Frontend build (React, ~13 primitives, 9 flows, a11y) | ~1.2M |
| Migrations (data-engineer) + metrics plan | ~0.35M |
| QA (test breadth incl. tenancy kit) + security deep review + compliance | ~0.55M |
| Gates 4–9 orchestration, deploy plan, rework buffer | ~0.4M |
| **Total** | **~5.6M** |

**Read:** a full-stack, regulated, 9-gate, 7-resource build plausibly lands **at or slightly
over the 5.5M hard cap** and **above the 4M allocation**. This is a **flag to the PM now, at
design time** — not a surprise at 90%. Levers to fit the envelope: (a) tighten review/rework
loops, (b) sequence frontend after backend contract freeze to avoid churn, (c) consider
deferring a sub-feature (e.g. tag color management, snooze) if budget pressure is real. Only a
**human** can approve additional token use; the spend agent should watch the 25/50/75/90%
thresholds early given this estimate sits near the cap.

---

## 9. Conventions honored (self-check)
- Named exports only; no default exports (route files export a named `Route`).
- Feature isolation — web imports via `features/team-todo/index.ts` barrel only.
- Contract-first — `openapi.yaml` is source of truth; `make claude-gen-client`; generated
  client never hand-edited.
- Knex/RDS Postgres; migrations owned by data-engineer, same PR as dependent code.
- Secrets by ARN from AWS key store; nothing sensitive in git/logs/fixtures.
- OWASP top-10 checklist (§5.4) verified before Gate 5.
- Verification via `verify.sh`/`make claude-check`; CI `all-green` is the gate; no tampering.

## 10. Open coherence items for the PM to reconcile at Gate 3
1. **CLAUDE.md/PRD stack line** says Fastify; recommend correcting to Hono (§1) — needs
   human ratification (D1).
2. **UX §10.4** ("block sole-owner deletion, require transfer") contradicts the resolved
   Gate-2 decision 2 (cascade-delete team); the UX doc should drop the block path (§6.2).
3. **UX §4** still lists the "move tasks to another list" option; the resolved Gate-2
   decision 1 is delete-with-tasks only — UX doc §4 to be trimmed to match (already noted
   in the UX Gate-2 block, but the §4 body still shows both options).
4. **Token estimate (§8.1)** sits near/over the 5.5M cap — PM/human to acknowledge and
   decide levers before Gate 4.

---

NEXT: route to pm — TDD ready for Gate 3 (Tdd Review); Hono-vs-Fastify recommendation = **adopt Hono, correct the CLAUDE.md/PRD stack line, record as ADR-0003** (human ratifies); data model (§3) complete and ready for the data-engineer to author migrations (incl. RLS policies + cascade FKs); flagged: token estimate ~5.6M sits at/over the 5.5M hard cap, and two UX-doc paths (§4 move-option, §10.4 block) contradict the resolved Gate-2 decisions and need reconciling | gate: human:3 Tdd Review
