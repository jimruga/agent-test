# Data Engineering Plan — Team To-Do App (MVP)

- **Status:** DRAFT — pending **Gate 3 (Tdd Review)**. Design/planning only.
  No migration has been applied; no metrics have been instrumented.
- **Author:** data-engineer
- **Date:** 2026-07-09
- **Risk tier:** REGULATED (PII + WCAG 2.2 AA + OAuth2)
- **Inputs:** `workspace/tdd-todo-app.md` §3/§4/§6 (data model, RLS decision D4,
  erasure asymmetry D3), `workspace/prd-todo-app.md` §5/§7, UX spec §10,
  ADR-0002 (compute model), `workspace/codebase-map.md`.
- **Note on `migrations` location:** the codebase map confirms no app code
  exists yet (`migrations/` GitHub location is not yet bootstrapped — Phase 0
  of the TDD's implementation plan). This document is the **concrete DDL plan**
  the data-engineer will author as real Knex migration files, one per numbered
  step below, **into `migrations/` in the same PR as the dependent code**, at
  implementation time. Nothing here has been run. Naming convention proposed:
  `migrations/<NNN>_<slug>.ts`, each exporting named `up`/`down` (no default
  exports, per CLAUDE.md).

---

## 0. Implementation addendum (2026-07-11) — S1 migrations authored, model reconciled

**Status:** migrations `001`-`005` **authored** to `migrations/` on
`feature/s0-s1-foundation-auth`, to land in the same PR as the S1 auth/session
code (`workspace/impl-notes-s0-s1.md`). **Not applied** — the sandbox has no
DB/npm-registry network; CI's `migrations` job (`.github/workflows/ci.yml`)
applies + rolls back on the ephemeral Postgres service. See
`workspace/migration-notes-auth.md` for the full authoring note. Three points
where the authored migrations diverge from this plan's original numbering/
sequencing, reconciled here:

1. **`teams` (originally `004_create_teams` in §1.4) is pulled forward and
   authored now, in the S1 PR, as a minimal referential prerequisite.**
   `memberships.team_id` is a NOT NULL FK to `teams(id)`, and S1's
   `GET /api/me` already returns the caller's memberships
   (`apps/api/src/auth/user-repository.knex.ts` `getWithMemberships`) — so
   `memberships` (needed by S1) cannot apply in CI without `teams` existing.
   The table landing now is the **minimal shape only** (id, name, created_by,
   timestamps) with no RLS and no feature behavior — S2 (`Teams &
   tenant-isolation foundation`, `workspace/stories-todo-app.md`) still owns
   the actual create/list/rename/delete-team feature and the tenant-isolation
   machinery (TDD §4). Numbering is unchanged from this plan (`004`); only
   the *timing* moved earlier.
2. **`sessions` (originally `012_create_sessions`, §1.12) is DEFERRED, not
   authored in this PR.** Reconciled with the software engineer
   (`workspace/impl-notes-s0-s1.md` "Data needed" section): S1 was built
   against a pure Redis `SessionStore` seam
   (`apps/api/src/auth/session-store.ts`, `RedisSessionStore`/`InMemoryRedis`)
   with **no** `KnexSessionRepository` or any code path that reads/writes a
   `sessions` table. TDD §3.1 already describes it as "the durable/audit
   record **if we choose** DB-backed sessions" — Redis is the hot store
   either way. Authoring an unconsumed table now is schema with no code
   behind it; deferred until a concrete consumer exists (candidate: the
   scheduled retention-purge job, TDD/data-plan Phase 6, per §3.2's session
   retention row — that job needs *something* to sweep, which is exactly
   where a durable `sessions` mirror would earn its keep). Revisit at S7/S9
   planning, not silently dropped.
3. **RLS (originally `013_enable_rls`, §2) is explicitly deferred past this
   PR**, including on `memberships` even though it now exists. Rationale and
   full staging plan in `workspace/migration-notes-auth.md` — short version:
   RLS depends on the scoped-repository seam (TDD §4.2) setting the
   `app.team_id` GUC per-transaction, which is S2 work; enabling `FORCE ROW
   LEVEL SECURITY` on `memberships` today, before that seam exists, would
   fail-closed `GET /api/me`'s membership read for every S1 user. §2.3's
   existing deferral of `users`/`oauth_identities`/`sessions` RLS to security
   review stands unchanged.

Everything else in §1-§7 below (table shapes, PII classification, retention
policy, metrics plan, test-data plan) is unchanged and still the target this
data-engineer builds subsequent migrations (`006`+, S2 onward) against.

---

## 1. Migration plan (forward + rollback)

Design rules applied throughout (per `postgres-data-modeling` skill + TDD §3):
- UUIDv7 surrogate PKs everywhere (D5) — sortable, non-guessable. Generated
  app-side (Node `uuidv7` lib) or via a Postgres extension if available in
  RDS; **not** `gen_random_uuid()` (that's v4, not sortable).
- `timestamptz` everywhere, never naive timestamps.
- Every team-owned table carries `team_id` (denormalized on purpose — RLS +
  scoped-repo filter target, TDD §4).
- FKs are real, with an explicit `ON DELETE` chosen per TDD §6, not left to
  default `NO ACTION`.
- All FK columns get a supporting index (Postgres does not auto-index them).
- Each migration ships forward (`up`) + rollback (`down`); CI applies **and**
  rolls back every migration (per CLAUDE.md verification gate) — so `down`
  must be a true inverse, not a no-op, wherever structurally possible. Table
  drops in `down` are acceptable pre-launch (no production data yet); once
  live, destructive `down`s get a follow-up "safe rollback" note (see 1.9).
- Ordering matters (dependency-respecting): parent tables before children,
  RLS enabled only after the table + `team_id` column exist.

### 1.1 `001_enable_extensions`
**Up:** enable `pgcrypto` (needed for `citext` and hashing helpers) and
`citext` extension (case-insensitive email/name matching, TDD §3.1).
**Down:** drop both extensions (guarded — only if no dependent columns; in
practice this is migration 001 so nothing depends on it yet at rollback time
in CI's isolated apply+rollback test).

### 1.2 `002_create_users`
**Up:**
```
users
  id              uuid PK default uuid_generate_v7()  -- or app-supplied
  email           citext NOT NULL
  display_name    text NOT NULL
  avatar_initials text NULL
  status          <enum users_status: 'active','deleted'> NOT NULL DEFAULT 'active'
  created_at      timestamptz NOT NULL DEFAULT now()
  updated_at      timestamptz NOT NULL DEFAULT now()
  deleted_at      timestamptz NULL
UNIQUE (email) WHERE status = 'active'   -- partial unique: a hard-erased user's
                                          -- tombstoned email (nulled, see 1.11)
                                          -- never collides with a new signup
```
Seed in the **same migration**: insert the reserved sentinel row used for
re-attribution (TDD §3.1/§6.3):
`INSERT INTO users (id, email, display_name, status, deleted_at) VALUES
('00000000-0000-7000-8000-000000000001', NULL, 'Deleted user', 'deleted', now())`
— a fixed, well-known UUID so app code and later migrations can reference it
by constant rather than querying for it.
**Down:** `DROP TABLE users` (cascades nothing yet — first table).

### 1.3 `003_create_oauth_identities`
**Up:**
```
oauth_identities
  id                uuid PK
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
  provider          text NOT NULL
  provider_subject  text NOT NULL
  created_at        timestamptz NOT NULL DEFAULT now()
UNIQUE (provider, provider_subject)
INDEX (user_id)
```
No OAuth tokens stored (TDD §5) — deliberately absent columns.
**Down:** `DROP TABLE oauth_identities`.

### 1.4 `004_create_teams`
**Up:**
```
teams
  id          uuid PK
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 200)
  created_by  uuid NULL REFERENCES users(id) ON DELETE SET NULL
  created_at  timestamptz NOT NULL DEFAULT now()
  updated_at  timestamptz NOT NULL DEFAULT now()
  deleted_at  timestamptz NULL
```
`created_by` is `SET NULL` (not `CASCADE`) — deleting the creator's user row
must not delete the team; sole-ownership cascade is handled at the
**membership** level (§6.2 of the TDD), not via this audit-only column.
**Down:** `DROP TABLE teams`.

### 1.5 `005_create_memberships`
**Up:**
```
memberships
  id         uuid PK
  team_id    uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
  role       <enum membership_role: 'owner','member'> NOT NULL
  created_at timestamptz NOT NULL DEFAULT now()
UNIQUE (team_id, user_id)
INDEX (user_id)
INDEX (team_id, user_id)   -- authz hot path, TDD §3.2
```
This table **is** the authorization source (TDD §4.1) — the app derives
`allowedTeamIds` from it on every request.
**Down:** `DROP TABLE memberships`.

### 1.6 `006_create_invites`
**Up:**
```
invites
  id          uuid PK
  team_id     uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE
  email       citext NOT NULL
  role        <enum membership_role> NOT NULL DEFAULT 'member'
  token_hash  text NOT NULL          -- SHA-256 of the raw invite token; raw
                                      -- token never stored (TDD §3.1)
  status      <enum invite_status: 'pending','accepted','revoked','expired'> NOT NULL DEFAULT 'pending'
  invited_by  uuid NULL REFERENCES users(id) ON DELETE SET NULL
  created_at  timestamptz NOT NULL DEFAULT now()
  expires_at  timestamptz NOT NULL
UNIQUE (token_hash)
UNIQUE (team_id, email) WHERE status = 'pending'   -- partial unique, TDD §3.1
INDEX (team_id)
```
**Down:** `DROP TABLE invites`.

### 1.7 `007_create_lists`
**Up:**
```
lists
  id         uuid PK
  team_id    uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE
  name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 200)
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL
  created_at timestamptz NOT NULL DEFAULT now()
  updated_at timestamptz NOT NULL DEFAULT now()
UNIQUE (team_id, lower(name))   -- confirmed dedupe w/ PM per TDD open note;
                                -- flagged below (§6) if PM says no, drop this
                                -- constraint in a follow-up migration
INDEX (team_id)
```
**Down:** `DROP TABLE lists`.

### 1.8 `008_create_tasks` — the cascade-critical table
**Up:**
```
tasks
  id            uuid PK
  team_id       uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE
  list_id       uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE   -- Gate-2 rule 1
  title         text NOT NULL CHECK (length(title) BETWEEN 1 AND 500)  -- free-text PII
  description   text NULL                                              -- free-text PII
  assignee_id   uuid NULL REFERENCES users(id) ON DELETE SET NULL
  created_by    uuid NULL REFERENCES users(id) ON DELETE SET NULL      -- re-pointed to
                                                                         -- sentinel on erasure,
                                                                         -- app-layer op (§6.3),
                                                                         -- not a DB trigger
  priority      <enum task_priority: 'low','med','high'> NULL
  due_at        timestamptz NULL
  completed_at  timestamptz NULL
  created_at    timestamptz NOT NULL DEFAULT now()
  updated_at    timestamptz NOT NULL DEFAULT now()
INDEX (team_id, list_id, completed_at, due_at)   -- list view + due sort
INDEX (team_id, assignee_id)                     -- "My Tasks"
INDEX (team_id, priority)
INDEX (team_id, created_at)
INDEX (team_id, due_at, id)                      -- keyset default-sort composite
```
**`assignee_id` cross-team check:** a plain FK cannot express "assignee must
be a member of `tasks.team_id`" (that's a cross-table, same-row constraint).
Enforced at two layers per TDD §4.2: (a) app/repo layer validates against
`memberships` before write (primary — returns the `422` UX needs); (b) DB
**trigger** `trg_tasks_assignee_must_be_member` (backstop) — `BEFORE INSERT OR
UPDATE`, raises if `NEW.assignee_id IS NOT NULL` and no row exists in
`memberships WHERE team_id = NEW.team_id AND user_id = NEW.assignee_id`. This
trigger ships in this same migration (`009_add_assignee_membership_trigger`,
see below) so it's reviewed alongside the table.
**Down:** `DROP TABLE tasks`.

### 1.9 `009_add_assignee_membership_trigger`
**Up:** create the trigger function + trigger described above.
**Down:** `DROP TRIGGER ...; DROP FUNCTION ...`.
*(Split into its own migration file so the trigger can be iterated/rolled
back independently of the `tasks` table shape — smaller blast radius.)*

### 1.10 `010_create_tags_and_task_tags`
**Up:**
```
tags
  id          uuid PK
  team_id     uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 50)
  color_token text NULL
  created_at  timestamptz NOT NULL DEFAULT now()
UNIQUE (team_id, lower(name))
INDEX (team_id)

task_tags
  task_id  uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE
  tag_id   uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE
  team_id  uuid NOT NULL     -- carried redundantly for RLS/scoping, TDD §3.1
PRIMARY KEY (task_id, tag_id)
INDEX (tag_id)
INDEX (team_id, tag_id)
```
`task_tags.team_id` has **no FK of its own** to avoid a diamond dependency;
it's kept consistent with `tasks.team_id`/`tags.team_id` via a `CHECK`-style
app-layer invariant plus a **trigger** (`trg_task_tags_team_consistency`,
`BEFORE INSERT`) that verifies `NEW.team_id = (SELECT team_id FROM tasks
WHERE id = NEW.task_id)` and same for `tags` — belt-and-suspenders so a bug
can't silently join across tenants through this table.
**Down:** `DROP TABLE task_tags; DROP TABLE tags;` (+ drop the trigger/function
first if `up` created them in this file, or in `011` if split out).

### 1.11 `011_create_reminders_and_notifications`
**Up:**
```
reminders
  id         uuid PK
  team_id    uuid NOT NULL
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE
  remind_at  timestamptz NOT NULL
  status     <enum reminder_status: 'scheduled','fired','cancelled','snoozed'> NOT NULL DEFAULT 'scheduled'
  created_at timestamptz NOT NULL DEFAULT now()
INDEX (status, remind_at) WHERE status = 'scheduled'   -- partial index, the scan's read path

notifications
  id         uuid PK
  team_id    uuid NOT NULL
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE   -- recipient
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE
  type       <enum notification_type: 'reminder'> NOT NULL DEFAULT 'reminder'
  payload    jsonb NOT NULL   -- denormalized title/dueAt; free-text PII (§3 below)
  read_at    timestamptz NULL
  created_at timestamptz NOT NULL DEFAULT now()
INDEX (user_id, read_at, created_at)   -- tray query
```
**Down:** `DROP TABLE notifications; DROP TABLE reminders;`.

### 1.12 `012_create_sessions` (durable/audit mirror; Redis is the hot store, TDD §5.2)
**Up:**
```
sessions
  id              uuid PK
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
  created_at      timestamptz NOT NULL DEFAULT now()
  expires_at      timestamptz NOT NULL
  idle_timeout_at timestamptz NOT NULL
  revoked_at      timestamptz NULL
  ip              inet NULL          -- operational, low-sensitivity (not PII-marketing)
  user_agent      text NULL
INDEX (user_id)
INDEX (expires_at) WHERE revoked_at IS NULL   -- expiry sweep
```
**Down:** `DROP TABLE sessions`.

### 1.13 `013_enable_rls` — see §2 below for the policies themselves.

### 1.14 `014_pii_erasure_support` (D3, TDD §6.3)
No new tables; this migration adds the mechanics the erasure operation needs:
- A **partial unique** on `users(email) WHERE status='active'` was already
  created in 1.2 (so a hard-erased user's nulled email never blocks a real
  new signup with that address).
- A `CHECK` on `users`: `status = 'deleted' => deleted_at IS NOT NULL` (keeps
  the tombstone state internally consistent).
- No trigger auto-erases anything — erasure is an **explicit, application-
  initiated, transactional operation** (TDD §6.3), never a DB-level cascade,
  because it must also touch Redis (session store) and the audit trail, which
  live outside Postgres. This migration only ensures the schema can represent
  the erased state cleanly.
**Down:** drop the `CHECK` constraint (the partial unique index drop is
covered by 002's rollback since it's the same migration that created it —
kept together intentionally to avoid two migrations touching one constraint).

### 1.15 Cascade rules — where each Gate-2 decision lives
| Gate-2 rule | Enforced by |
|---|---|
| **List delete → cascade tasks** (decision 1) | `tasks.list_id … ON DELETE CASCADE` (1.8). Cascades transitively to `task_tags`, `reminders`, `notifications` via their own `ON DELETE CASCADE` off `task_id`/`tag_id`. One `DELETE FROM lists WHERE id = $1` in the app's transaction does the whole tree; app wraps it in a transaction per TDD §6.1 only to pair it with the pre-delete count query for the UX confirmation copy ("...and its N tasks") — the DB-level cascade itself is atomic already. |
| **Sole-owner account deletion → cascade team** (decision 2) | **Not** a single FK cascade — it's conditional on "sole owner," which SQL FKs can't express. Implemented as an **application-layer transaction** (TDD §6.2): app queries `memberships` to find teams where the caller is the only `role='owner'` row, then issues `DELETE FROM teams WHERE id = $1` for each such team — which **then** cascades via `teams` → `memberships`/`lists`/`invites` (`ON DELETE CASCADE`, 1.4-1.7) → `lists` → `tasks` (`ON DELETE CASCADE`, 1.8) → tags joins/reminders/notifications. For teams with other owners, the app instead does `DELETE FROM memberships WHERE team_id=$1 AND user_id=$2` (single-row remove, team survives). |
| **PII-erasure asymmetry** (D3) | See §1.14 and §6.3 handling below — explicit app operation, not a cascade. |

### 1.16 Rollback safety note for CI
Every `down` above is a real inverse (table/constraint drop) because there is
no production data yet (Phase 0/1 of the TDD implementation plan) — safe for
CI's apply-then-rollback check. **Once any of these tables carry real data in
a deployed environment**, a destructive `down` (e.g. `DROP TABLE tasks`) is no
longer an acceptable rollback for a *future* migration that alters `tasks` —
at that point the convention becomes additive/backward-compatible migrations
(add nullable column → backfill → constrain in a later migration) so `down`
never discards live data. Flagging this now so the precedent is set correctly
for migration 015+.

---

## 2. Multi-tenant isolation — Postgres Row-Level Security (D4)

Defense-in-depth **behind** the app's scoped repository (TDD §4.2 is primary
enforcement; RLS is the backstop if a repo bug ever omits `WHERE team_id=`).

### 2.1 Session/transaction tenant context
The app sets two GUCs via Knex **at the start of every request's
transaction/connection checkout**, before any tenant-scoped query:
```sql
SELECT set_config('app.team_id', $1, true);   -- true = transaction-local
SELECT set_config('app.user_id', $2, true);
```
Using `true` (local) is deliberate: it auto-resets at transaction end, so a
**pooled connection can never leak tenant A's setting into tenant B's next
request** (TDD §4.3 trade-off note) — this is the exact hazard ADR-0002's warm
Knex pool introduces, and it's why `true`/local (not session-level `SET`) is
non-negotiable. QA's negative-test-kit item 7 (TDD §4.5) verifies this
directly: two sequential requests for different tenants on one connection
must each see only their own rows.

### 2.2 Policy shape (identical pattern per team-owned table)
For every table carrying `team_id` — `memberships`, `invites`, `lists`,
`tasks`, `tags`, `task_tags`, `reminders`, `notifications` — migration 013
does, per table:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;  -- applies even to the table owner role
CREATE POLICY tenant_isolation ON <table>
  USING (team_id = current_setting('app.team_id', true)::uuid)
  WITH CHECK (team_id = current_setting('app.team_id', true)::uuid);
```
- `USING` gates reads/updates/deletes; `WITH CHECK` gates inserts/updates so a
  write can't *set* a row into another tenant either.
- `FORCE ROW LEVEL SECURITY` matters because the app's DB role is likely the
  table owner (migrations run as that role) — without `FORCE`, RLS is
  bypassed for the owner by default, defeating the backstop.
- `current_setting('app.team_id', true)` — the `true` second arg makes it
  return `NULL` instead of erroring if unset, so a query issued *outside* any
  tenant context (a bug) fails closed (no rows match `team_id = NULL`) rather
  than throwing an unhandled exception mid-request. Preferred over erroring
  because a silent empty-result is safer to no-PII-leak than a stack trace
  that might get logged with query context.

### 2.3 Tables intentionally **without** this RLS policy
- `users`, `oauth_identities`, `sessions` — scoped by `user_id`/session, not
  `team_id`; not team-owned rows. A **separate**, narrower policy
  (`user_id = current_setting('app.user_id', true)::uuid`, with an explicit
  carve-out for the sentinel row and for the auth flow which must look up a
  user by `email`/`provider_subject` pre-session) is out of scope for MVP RLS
  given auth lookups need broader read access at specific, audited call
  sites; enforced instead by the app's auth/session layer being the only code
  path that touches these tables pre-authentication. Flagged for security
  review at Gate 5 rather than solved unilaterally here — a database role
  with narrower grants for the auth-service path is the likely follow-up.
- `teams` itself — has no `team_id` column (it *is* the tenant); membership
  is what scopes visibility, enforced at the `memberships` RLS policy plus
  the app layer (a `SELECT` on `teams` must join through `memberships` in
  practice; RLS on `teams` directly would need a policy keyed off
  `EXISTS(SELECT 1 FROM memberships WHERE team_id=teams.id AND
  user_id=current_setting('app.user_id',true)::uuid)` — included in 013 as a
  belt-and-suspenders policy on `teams` too, since it's cheap and closes a
  gap the table list above would otherwise leave.

### 2.4 DB role model
Migrations run as an `app_migrator` role (schema DDL rights, bypasses RLS by
necessity — never used by the running app). The running API connects as a
narrower `app_runtime` role: DML only, no DDL, subject to `FORCE ROW LEVEL
SECURITY`. This split is a devops/secrets-management concern to provision
(IAM-authenticated RDS role, ARN-referenced) — noted here because the RLS
design assumes it.

---

## 3. Data classification + retention (PRD §5, satisfies Gate-5 evidence)

### 3.1 Per-column classification

| Table.column | Class | Rationale |
|---|---|---|
| `users.email` | **Regulated — PII** | direct identifier; encrypted at rest (KMS), citext |
| `users.display_name` | **Regulated — PII** | direct identifier |
| `users.avatar_initials` | Internal | derived from name, low sensitivity, no external image |
| `invites.email` | **Regulated — PII** | pre-account identifier |
| `oauth_identities.provider_subject` | **Regulated — PII** | stable third-party identifier, indirectly identifying |
| `tasks.title`, `tasks.description` | **Confidential — free-text PII** | PRD §5: user free text, may contain PII, treated under the PII regime |
| `notifications.payload` (jsonb) | **Confidential — free-text PII** | denormalizes task title/due date for the tray |
| `sessions.ip`, `sessions.user_agent` | Internal — low-sensitivity operational | not used for marketing/profiling; security/telemetry only |
| `invites.token_hash` | Confidential (secret-adjacent) | hash only; raw token never stored |
| `teams.name`, `lists.name`, `tags.name` | Internal | business/organizational data, not personal |
| `memberships.role`, `*.created_at/updated_at`, enums, ids | Internal | structural/operational |
| OAuth access/refresh tokens | **Regulated — never stored in Postgres** | Redis-only, TTL-bound (TDD §5.2) |

### 3.2 Retention policy per class (enforced, not aspirational)

| Class | Retention | Enforcement mechanism |
|---|---|---|
| Regulated PII (`users.email/display_name`, `invites.email`, `oauth_identities`) | Until account deletion request, then **hard-erased within the same transaction** (§6.3 below) — no retention window after request (PRD §5: "a defined erasure path exists"). | App-layer erasure transaction (`DELETE /api/me`); DB `CHECK` (1.14) enforces the tombstoned-state invariant; no scheduled job needed since erasure is on-demand, immediate. |
| Confidential free-text (`tasks.title/description`, `notifications.payload`) | Retained for the **life of the team record** (team records, not personal records) — see erasure asymmetry §4 below; deleted only when the parent `list`/`task` is deleted by a user action (cascade) or the **team** itself is deleted (sole-owner cascade). | FK `ON DELETE CASCADE` chain (§1.15); no independent TTL — lifetime is tied to the owning list/team, a product decision, not a compliance-mandated purge. |
| `sessions` / Redis session records | Idle timeout + absolute expiry (TDD §5.2, values owned by security/software-engineer at implementation); **DB `sessions` rows past `expires_at`** are periodically purged. | Scheduled cleanup job (candidate: EventBridge→Lambda alongside the reminder scanner, ADR-0002) — `DELETE FROM sessions WHERE expires_at < now() - interval '30 days'` (retain a short forensic tail past expiry, then purge). Exact tail length is a security-agent call at Gate 5, defaulting to 30 days here. |
| `notifications` (delivered, read) | Read notifications older than **90 days** are purged (tray doesn't need unbounded history; reduces PII-bearing `payload` footprint over time). | Same scheduled job, `DELETE FROM notifications WHERE read_at IS NOT NULL AND read_at < now() - interval '90 days'`. |
| `invites` (expired/revoked) | Purge **180 days** after `expires_at`/revocation — kept briefly for support/dispute investigation, not indefinitely (still contains an email). | Scheduled job. |
| `reminders` (fired/cancelled) | Purge **30 days** after status change to `fired`/`cancelled` — operational scheduling data, no PII itself but ties to `task_id`. | Scheduled job. |
| Audit trail (`compliance/audit-log.jsonl`) | Governed separately per `compliance/audit-trail.md` — **not** this feature's retention call; referenced here only to note PII erasure entries reference user **id**, never PII value (TDD §6.3), so audit retention never conflicts with erasure. | Out of this migration's scope. |

**Enforcement note:** retention here is "delete when the record's natural
lifecycle ends" (cascades) plus **one new scheduled purge job** for the
time-boxed classes (sessions/notifications/invites/reminders). That job is
implementation work for Phase 6 of the TDD (alongside the reminder scanner,
same EventBridge/Lambda pattern) — flagged to the PM/software-engineer as a
small additional scope item, not yet built.

---

## 4. PII-erasure asymmetry — the operation (D3, TDD §6.3), as data-engineer implements it

On `DELETE /api/me`, in **one Postgres transaction** (plus a Redis delete
outside that transaction, sequenced after commit):

1. For each team where the caller has `role='owner'`, check via `memberships`
   whether any *other* row has `role='owner'` for that `team_id`.
   - **No other owner (sole owner):** `DELETE FROM teams WHERE id = $team_id`
     — cascades per §1.15.
   - **Other owner exists:** `DELETE FROM memberships WHERE team_id=$team_id
     AND user_id=$caller_id` — caller leaves, team survives.
2. **Re-attribution pass**, for every *surviving* team the caller had
   authored content in:
   `UPDATE tasks SET created_by = '00000000-0000-7000-8000-000000000001'
    WHERE created_by = $caller_id AND team_id = ANY($surviving_team_ids)`
   (the sentinel from 1.2). `assignee_id` is already handled by the `ON
   DELETE SET NULL` FK once the `users` row's dependent state is cleared, but
   because the erasure keeps the `users` row (tombstoned, not physically
   deleted — §5 below), that FK's `SET NULL` won't fire automatically; the
   same transaction explicitly runs
   `UPDATE tasks SET assignee_id = NULL WHERE assignee_id = $caller_id`.
3. **Hard-erase** the `users` row itself:
   `UPDATE users SET email = NULL, display_name = 'Deleted user',
    avatar_initials = NULL, status = 'deleted', deleted_at = now()
    WHERE id = $caller_id`.
   Row is **tombstoned, not physically deleted** — deliberate, so every FK
   referencing it (`oauth_identities`, `sessions`, any remaining
   `invited_by`/`created_by` references in *deleted* teams which don't matter
   post-cascade) stays valid without needing `ON DELETE` to fire.
4. `DELETE FROM oauth_identities WHERE user_id = $caller_id` (no reason to
   keep provider linkage post-erasure) and `DELETE FROM notifications WHERE
   user_id = $caller_id` (their own inbox).
5. Mark all `sessions` rows for the user `revoked_at = now()`.
6. **After** the transaction commits: delete the Redis session + revoke the
   provider refresh token (TDD §5.2/§6.2 step 3) — sequenced after commit so
   a Postgres rollback never leaves Redis and Postgres disagreeing about
   whether the account still exists.
7. Application writes the audit-trail entry `PII_ERASURE` referencing
   `user_id` only (never email/display_name value), per CLAUDE.md.

**Idempotency:** re-running the same erasure on an already-`status='deleted'`
user is a no-op (step 3's `UPDATE` matches zero rows on the second call,
step 1/2 already resolved) — safe to retry on a transient failure, satisfying
TDD §6.3's "idempotent, transactional" requirement.

**Why the sentinel is a real row, not a magic NULL:** it lets
`created_by` stay `NOT NULL`-free of special-casing in the app (a task
authored by a deleted user still joins cleanly to a `users` row for display —
UI just renders "Deleted user" like any other author), and it's a single,
predictable target `UPDATE` rather than a NULL that every read path would
need to special-case.

---

## 5. Metrics plan (PLANNING ONLY — requires Gate 8 human approval before any instrumentation)

No events below are wired up yet. This is the plan the PM/human review at
Gate 8, per CLAUDE.md ("Metrics Review — before instrumenting any metrics").

### 5.1 Design constraints (privacy-first, satisfies PRD §5)
- **No PII, no free text, in metrics or logs.** Events carry **ids only**
  (`user_id`, `team_id`, `task_id`) — never `email`, `display_name`,
  `task.title`, `task.description`, or `notification.payload`. Analysts join
  ids back to Postgres (access-controlled) if they ever need the underlying
  record — the metrics/analytics pipeline itself never carries the content.
- **No double-counting:** each business event has exactly one emission point
  in the API layer (not also in the frontend, not also in the worker) to
  avoid the same task-completion being counted twice from two call sites. The
  scoped repository (TDD §4.2) is the natural single choke point for
  create/update/delete — events emit there, not in route handlers, so a
  future second route hitting the same repo method doesn't double-emit.
  Reminder-scan-originated notification events are the one intentionally
  separate emission point (they're a different actor — the Lambda scan, TDD
  §2.2 note) and are named distinctly (`reminder.notification_created`) so
  they're never confused with a user-initiated event.
- **Owner:** data-engineer (this plan); **consumer:** PM (success metrics),
  analyst (ROI), sre (the SLI subset below).

### 5.2 Business/usage events → PRD §7 success metrics

| Event | Fired when | Payload (ids/enums only) | Feeds |
|---|---|---|---|
| `user.signed_up` | first successful OAuth callback creates a new `users` row | `user_id`, `provider` | Activation funnel denominator |
| `user.invite_accepted` | `POST /api/invites/{token}/accept` succeeds | `user_id`, `team_id`, `invite_id` | Activation numerator eligibility (invited users) |
| `task.created` | task insert commits | `user_id`, `team_id`, `list_id`, `task_id` | Activation (≥1 task/7 days), engagement (tasks created/week) |
| `task.completed` | `completed_at` transitions null→set | `user_id`, `team_id`, `task_id` | Activation, engagement (tasks completed/week) |
| `task.completed_undone` | `completed_at` transitions set→null | `user_id`, `team_id`, `task_id` | Denominator correction so undo isn't double-counted as two completions |
| `team.created` | team insert commits | `user_id` (creator), `team_id` | Team-count denominator |
| `team.activity_ping` | **derived, not emitted per-request** — a nightly rollup marks a `team_id` "active this week" if it has ≥1 `task.created`/`task.completed`/`list` mutation event in the trailing 7 days | `team_id`, `week_start` | Weekly active teams (PRD §7) — computed as a rollup to avoid a noisy per-request event and to give one canonical definition of "active" |
| `retention.week4_check` | derived weekly batch: for each team whose `team.created` was exactly 4 weeks ago, did it have a `team.activity_ping` this week? | `team_id`, `cohort_week` | Week-4 team retention (PRD §7) |

**Why rollups instead of raw-event dashboards for "weekly active teams" and
"retention":** both PRD metrics are defined over a **week** window and a
**cohort**, which is a batch/derived computation, not a single event — doing
it as a nightly/weekly job against the raw `task.*`/`list.*`/`team.*` event
stream (or directly against Postgres `created_at`/`completed_at` columns,
which is simpler and avoids a separate events pipeline for MVP — see 5.4)
keeps the definition in exactly one place instead of every dashboard
re-deriving it slightly differently.

### 5.3 SLIs for SRE (feeds `reliability/slo-policy.md`, not this doc's owner)
Per PRD §7 reliability line — data-engineer instruments the raw signal;
**sre owns the SLO/burn-rate policy** on top of it:
- `api.request` — every request: `route`, `status_code`, `duration_ms`,
  `team_id` (id only). Feeds availability, error rate (<0.5%), and the
  p95 task-list-load SLI (`route = GET /api/teams/{teamId}/tasks`).
- `reminder.scan_run` — each EventBridge/Lambda scan invocation:
  `scheduled_count`, `notifications_created`, `duration_ms`, `lag_seconds`
  (time between `remind_at` and notification-row creation) — feeds the
  "reminder delivered within ±5 min" SLO directly.
- These are **Datadog metrics + Sentry error capture** per CLAUDE.md's
  monitoring stack — not a bespoke events table.

### 5.4 Where events land (proposed, for Gate 8 discussion)
Given this is a low-thousands-of-users MVP (PRD §11) with Heap already in the
stack for click/activity tracking (CLAUDE.md monitoring section):
- **Usage/business events (§5.2):** emit to **Heap** (already-approved tool,
  ids-only custom properties) for the funnel/engagement analysis PM needs, so
  no new pipeline is built for MVP. The weekly-active/retention rollups can
  equally be computed as **scheduled SQL against Postgres timestamps**
  (`tasks.created_at`, `completed_at`, `teams.created_at`, plus a lightweight
  `team_activity_weekly` materialized view) — cheaper and more auditable than
  re-deriving them from a third-party event stream, and is my recommendation:
  **Postgres-derived rollups for the PRD §7 metrics, Heap for ad-hoc funnel
  exploration.**
- **SLIs (§5.3):** Datadog (already in stack), per CLAUDE.md.
- **Dashboards:** one Datadog dashboard (SLIs/SRE) + one lightweight
  Postgres-backed dashboard or a scheduled Confluence-posted summary (activation
  %, weekly active teams, tasks created/completed, week-4 retention) for the
  PM/analyst ROI review — exact tool (Metabase/Redash vs a scheduled query +
  Slack post) is an open question for Gate 8, not decided unilaterally here.
- **Alerts:** Slack, per CLAUDE.md observability rule — SRE's SLO burn-rate
  alerts (§5.3) plus a data-quality alert if the nightly rollup job fails to
  run (so a metrics gap doesn't go unnoticed).

### 5.5 ROI metrics for the PM
Ties usage to the PRD's value hypothesis ("teams that adopt this stop
scattering task tracking across chat/docs") with explicit assumptions:
- **Adoption depth:** tasks created per active team per week (already in
  §5.2) as a proxy for "is this actually where the team tracks work."
- **Habit formation:** week-4 retention (PRD §7) as the leading indicator that
  usage isn't a one-time trial.
- **Cost side:** AWS runtime actuals (devops/spend-agent-reported, PRD §9) +
  token build spend (PRD §8) — data-engineer supplies the usage numerator,
  does **not** compute the cost side (that's spend/devops); analyst combines
  both into the keep/iterate/kill recommendation per `governance/roi-loop.md`.
- **Assumption flagged explicitly (per ROI-modeling practice):** activation
  (≥1 task in 7 days) is treated as a leading proxy for eventual retention —
  this is an assumption, not a proven causal link, and should be revisited
  once real cohort data exists.

---

## 6. Test datasets (fabrication for QA + software engineer)

Per the `test-data` skill: synthetic only, seeded/deterministic, matches real
schema/constraints, deliberately covers edge cases. **Never derived from
production** (none exists yet regardless — this is pre-launch).

### 6.1 Generator design
- **Tool:** Node/TS script (`scripts/fabricate-test-data.ts`, proposed — not
  yet written; this is the plan) using `@faker-js/faker` seeded with a fixed
  integer (`faker.seed(20260709)`) so every run is byte-identical, per the
  skill's determinism rule. Runs against a local/staging Postgres via the
  same Knex config as the app (never against a shared/prod DB).
- **Sizes:**
  - **Tiny** (unit tests): 2 teams, 2 users each, 1 list/team, 3-5 tasks/list.
  - **Medium** (integration/QA): 10 teams, 3-8 members/team, 2-4 lists/team,
    20-80 tasks/list, realistic tag vocabularies (5-10 tags/team), a mix of
    completed/open/overdue/due-soon tasks, 1-2 pending invites/team.
  - **Large** (performance, keyset pagination + `EXPLAIN ANALYZE` per the
    postgres-data-modeling skill): 200 teams, up to 500 tasks in a single
    list (pagination stress), to validate the `(team_id, due_at, id)` keyset
    index actually avoids offset-drift/N+1 patterns at scale.

### 6.2 Deliberate edge cases (per the skill's checklist)
- **Nulls/empties:** tasks with no `description`, no `assignee_id`, no
  `due_at`, no `priority`, no tags; a list with zero tasks; a team with zero
  lists (fresh-onboarding state, exercises UX §8.10 empty states).
- **Boundary/max-length:** `tasks.title` at exactly 1 char and exactly 500
  chars (the `CHECK` boundary); `tags.name` at 50 chars; a team name at 200.
- **Unicode:** display names and task titles with emoji, RTL (Arabic/Hebrew)
  text, combining diacritics, and CJK — exercises citext collation and UI
  truncation/measurement.
- **Timezones:** `due_at`/`remind_at` values spanning multiple offsets
  (including DST-transition dates) stored as `timestamptz`, to catch any
  accidental naive-timestamp handling in the app.
- **Duplicates:** two teams with identically-named lists/tags (must not
  collide — uniqueness is `(team_id, ...)`-scoped); an email invited to two
  different teams (must not collide — uniqueness is per-team).
- **Referential edge cases:** a task whose `assignee_id` was removed from
  the team **after** assignment (simulates the TDD §4.2/UX §6 error path —
  the app-layer/trigger prevents *new* invalid assignments, but a fixture
  should still model the "member left" cleanup: `assignee_id` set to a
  *former* member — actually caught by the trigger at insert time, so
  fabricate this by inserting the task first, then removing the membership,
  to reproduce the state the UI's "no longer on the team" error path (UX §6)
  must handle on next read/edit); an already-erased sentinel-authored task
  (pre-seed a task with `created_by` = the sentinel from 1.2, simulating
  post-erasure state without needing to run the erasure flow); a `reminders`
  row already `fired` for a `completed_at` task (simulates the "no reminder
  after completion" race, TDD §7 AC).
- **Cross-tenant negative fixtures (required, feeds TDD §4.5 test kit):** a
  fixed pair of teams — "Team Alpha" and "Team Beta" — each with disjoint
  users, so QA's tenancy suite always has a known-good "attempt to access the
  other team's list/task/member/invite by id" fixture without needing to
  generate ids on the fly. Include: a user who is a member of **neither**
  team (to prove `GET /api/teams` returns empty, not an error); a user who is
  a member of **both** (to prove team-switching is fully isolated per
  request, not per-session).

### 6.3 Delivery
- Fabrication script + a `README` (usage: `npm run fabricate -- --size=medium
  --seed=20260709`) checked in under `scripts/` (or `packages/shared/test-
  fixtures/` if the software engineer prefers fixtures co-located with test
  code — to confirm with them at implementation time; not decided
  unilaterally here since it touches their test harness).
- QA consumes the **medium** dataset by default (per the skill's "smallest
  dataset that exercises the behavior" rule), reserving **large** for
  dedicated performance/pagination tests, and resets/reseeds per test run for
  isolation (no cross-test dependencies) — QA owns wiring this into their
  suite; this data-engineer output is the generator + fixed cross-tenant
  fixture, not the test harness itself.
- Software engineer consumes **tiny** for fast local iteration during TDD
  red/green cycles.

---

## 7. Open items flagged to PM/human (for Gate 3)

1. `lists` unique-name-per-team constraint (`UNIQUE(team_id, lower(name))`,
   §1.7) mirrors a TDD note flagged "confirm w/ PM" — if the PM decides
   duplicate list names should be allowed, this is a one-line follow-up
   migration to drop the constraint; called out so it isn't silently assumed.
2. New scope item: a **scheduled retention-purge job** (§3.2) for
   sessions/notifications/invites/reminders isn't in the TDD's phase plan —
   proposing it ride with Phase 6 (same EventBridge/Lambda pattern as the
   reminder scanner) since it's the same infrastructure shape.
3. RLS on `users`/`oauth_identities`/`sessions` (§2.3) is deliberately **not**
   solved here — flagged for security review at Gate 5 (narrower auth-service
   DB role vs. a `user_id`-keyed policy with pre-auth carve-outs).
4. Metrics destination (§5.4): recommending Postgres-derived rollups for the
   PRD §7 metrics + Heap for funnel exploration, rather than a new pipeline —
   needs Gate 8 sign-off, not decided unilaterally.
5. Exact retention windows in §3.2 (30/90/180/30 days) are this agent's
   defaults, not a legal determination — compliance/security should confirm
   before Gate 5.

---

NEXT: route to pm — migration plan (DDL + forward/rollback, cascade rules, assignee-membership trigger), RLS policies (defense-in-depth per D4), per-column classification + retention policy, metrics plan (business/usage/SLI, ids-only, no PII), and the test-dataset fabrication plan are ready for Gate 3 (Tdd Review); metrics plan additionally needs Gate 8 approval before any instrumentation, migrations will be authored to `migrations/` in the same PR as the dependent code at implementation time (Phase 0 bootstrap hasn't happened yet per codebase-map) | gate: human:3 Tdd Review
