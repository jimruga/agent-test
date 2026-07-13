# Migration Notes — S1 Auth & Session (users, oauth_identities, memberships)

- **Author:** data-engineer
- **Date:** 2026-07-11
- **Branch:** `feature/s0-s1-foundation-auth` (existing branch, staged for the
  same PR as the software engineer's S0/S1 code — branch policy: migrations
  reviewed with the dependent code, `.claude/CLAUDE.md`).
- **Files authored** (`migrations/`, named `up`/`down` exports, Knex/TS,
  `.ts` per `apps/api/knexfile.ts`'s `migrations.extension`):
  - `migrations/001_enable_extensions.ts`
  - `migrations/002_create_users.ts`
  - `migrations/003_create_oauth_identities.ts`
  - `migrations/004_create_teams.ts`
  - `migrations/005_create_memberships.ts`
- **Not executed.** The sandbox has no DB/npm-registry network — I did not
  run `npm --workspace @repo/api run migrate:up`/`migrate:down` and I am not
  asserting they pass. CI's `migrations` job
  (`.github/workflows/ci.yml`, service: ephemeral `postgres:16`) is the real
  verifier: it runs `migrate:up` then `migrate:down` and fails the job if
  either direction errors — that is the evidence, not this note.
- **Not committed.** `git commit` is permission-denied in this sandbox (same
  constraint the software engineer hit — `workspace/impl-notes-s0-s1.md`). I
  staged the five files with `git add`; **a human must run the commit** (and
  push / open the PR, unless the engineer's PR is opened first and this is
  pushed as an additional commit to the same branch).

## Scope decision: what's in this PR vs. deferred

Per the dispatch brief, S1 needs `users`, `oauth_identities`, `memberships`,
and a decision on `sessions`. I read the engineer's
`workspace/impl-notes-s0-s1.md` to reconcile against what was actually built,
not just what the TDD/data-plan designed in the abstract.

**`users`, `oauth_identities` — as planned**, matching data-plan §1.2/§1.3
and TDD §3.1 exactly. `KnexUserRepository` (`apps/api/src/auth/
user-repository.knex.ts`) queries both directly; column names/shapes match
what that adapter expects (`id`, `email`, `display_name`, `avatar_initials`,
`status` on `users`; `user_id`/`provider`/`provider_subject` on
`oauth_identities`).

**`teams` — added now, minimally, as a referential prerequisite.**
`memberships.team_id` is `NOT NULL REFERENCES teams(id)`. Without a `teams`
table, `005_create_memberships` cannot apply — CI's apply+rollback gate would
fail on a missing FK target, not because of anything wrong with the
memberships shape itself. `KnexUserRepository.getWithMemberships` (already
built, part of S1's `GET /api/me`) queries `memberships`, so `memberships`
itself is a real S1 dependency, not speculative. Rather than block S1 on a
schema gap, I authored `teams` now with **only** the columns the data-plan
already specified (`id`, `name`, `created_by`, timestamps, `deleted_at`) and
**no RLS, no S2 behavior**. S2 ("Teams & tenant-isolation foundation",
`workspace/stories-todo-app.md`) still owns: the create/rename/delete-team
API, the scoped/tenant repository, and the tenant-isolation machinery (TDD
§4). This is a schema-only landing, reviewed here so it doesn't silently
become "the data-engineer decided teams behavior" — it didn't; it decided a
table has to exist for a foreign key to be valid.

**`sessions` — deferred, not authored in this PR.** I checked the engineer's
notes specifically for this: S1 was built against `apps/api/src/auth/
session-store.ts`'s `SessionStore` interface, implemented by
`RedisSessionStore` over a `RedisLike` seam (`ioredis` in prod,
`InMemoryRedis` in tests). There is **no** Knex-backed session
repository and no code path reads or writes a `sessions` table — sessions
are Redis-only in what was actually built. The TDD (§3.1) frames the table as
optional ("the durable/audit record **if we choose** DB-backed sessions");
the data-plan (§1.12) authored it anyway as a forward-looking mirror. I'm not
carrying an unconsumed table into this PR — that's schema debt with no code
behind it and nothing for CI's migration lane to prove meaningfully (an empty
table that nothing writes to "applies and rolls back" trivially, which isn't
useful signal). **Recommendation:** revisit when there's a concrete
consumer — the strongest candidate is the scheduled retention-purge job
(data-plan §3.2, TDD Phase 6) that needs to sweep expired session records;
that's the point where a durable Postgres mirror actually earns its keep
versus Redis TTLs alone. Until then, this is tracked as an open item, not
dropped. `workspace/data-plan-todo-app.md` §0 records this decision so it
isn't re-litigated from scratch at S7/S9 planning.

## Row-Level Security posture (D4) — staged, not implemented, in this PR

The data-plan (§2) designs RLS as **one migration (`013_enable_rls`)** applied
uniformly across every team-owned table, after they all exist, plus a
separate narrower policy for the auth tables. I'm keeping that shape rather
than enabling RLS piecemeal as each table lands, for a concrete reason:

- **RLS on `memberships` now would break S1.** The policy design
  (`team_id = current_setting('app.team_id', true)::uuid`, `FORCE ROW LEVEL
  SECURITY`) requires the app to `set_config('app.team_id', ...)` per
  transaction — that's the scoped-repository seam (TDD §4.2), which is **S2**
  work and does not exist yet. If I enabled `FORCE RLS` on `memberships`
  today, `KnexUserRepository.getWithMemberships`'s plain
  `knex('memberships').where({ user_id })` query (no GUC set anywhere in the
  S1 code path) would silently return zero rows for every user —
  `current_setting('app.team_id', true)` returns `NULL` when unset, and
  `NULL = team_id` never matches (data-plan §2.2's documented fail-closed
  behavior). `GET /api/me` would report no memberships for anyone. That's a
  real regression I'm not willing to introduce two features early.
- **Recommendation:** enable RLS in one migration when S2 lands the
  scoped-repository seam and the bulk of the other team-owned tables (lists,
  tasks, tags, invites, task_tags, reminders, notifications) — matching the
  data-plan's original `013_enable_rls` design and its pooled-connection GUC
  reset guidance (data-plan §2.1, TDD §4.3). `teams` itself gets the
  membership-`EXISTS` policy variant described in data-plan §2.3 at the same
  time, not before.
- **`users` / `oauth_identities` RLS — unchanged, still deferred to security.**
  Data-plan §2.3 already flags these as needing a narrower, `user_id`-keyed
  policy with pre-auth carve-outs (auth needs to look up a user by
  email/provider_subject *before* a session/tenant context exists) — that
  design call is explicitly routed to security's deep review before Gate 5,
  per both the data-plan and the engineer's own coordination note
  (`workspace/impl-notes-s0-s1.md` "Coordination / routing"). I'm not
  resolving it unilaterally here; restating it so it doesn't get lost between
  two source documents.
- **What this PR ships instead of RLS:** the app-layer enforcement this
  migration set doesn't touch at all — `memberships` is the authorization
  source (TDD §4.1) and S1 doesn't yet expose any team-scoped endpoint, so
  there is no cross-tenant surface for RLS to defend *yet*. The risk window
  this defers is real but currently empty; it closes when S2 adds the first
  team-scoped read/write, at which point RLS lands in the same PR as that
  code (same branch-policy discipline).

## Design choices carried over from the data-plan, worth restating

- **UUIDv7, app-supplied, no DB default.** No `id` column has a
  `DEFAULT gen_random_uuid()` or similar — IDs are generated by the
  application (`generateId` injected into `KnexUserRepository`) so they stay
  sortable/non-guessable (TDD D5) without relying on a Postgres v7 generator
  function that may not exist on the RDS build. This matches how the
  engineer already wired the repository, not a new convention.
- **Sentinel "Deleted user" row**, fixed UUID
  `00000000-0000-7000-8000-000000000001`, seeded in `002_create_users`
  alongside the table it belongs to (TDD §3.1/§6.3, D3). No PII value in the
  migration — `email` is `NULL` for the sentinel.
- **Partial unique `users(email) WHERE status = 'active'`** so a hard-erased
  user's tombstoned (nulled) email never blocks a new signup reusing that
  address.
- **`timestamptz` everywhere, explicit `ON DELETE`** on every FK
  (`oauth_identities.user_id` CASCADE, `teams.created_by` SET NULL,
  `memberships.team_id`/`user_id` CASCADE) — nothing left to Postgres's
  default `NO ACTION`, per the `postgres-data-modeling` skill and TDD §3.
- **All FK columns indexed** (`oauth_identities.user_id`,
  `teams.created_by`, `memberships.user_id`, plus the composite
  `(team_id, user_id)` for the authz hot path) — Knex does not auto-create
  these.

## PII / data-classification recap for this migration set (data-plan §3.1)

| Table.column | Class | Handling in this migration |
|---|---|---|
| `users.email` | Regulated PII | citext, nullable (nulled on erasure), partial-unique on active rows. Encryption-at-rest (KMS) is app/infra wiring, not DDL — tracked separately for devops/security before Gate 6, not solved by this schema. |
| `users.display_name` | Regulated PII | text, not null (sentinel value `'Deleted user'` is not personal data). |
| `users.avatar_initials` | Internal | derived, low sensitivity. |
| `oauth_identities.provider_subject` | Regulated PII | third-party stable identifier; no tokens stored alongside it. |
| `teams.name` | Internal | organizational, not personal — table is a minimal prerequisite in this PR, no PII risk introduced. |
| `memberships.role`, timestamps, ids | Internal | structural. |

No secrets, no PII **values**, and no literal example data beyond the
sentinel's fixed placeholder strings (`'Deleted user'`, `NULL` email) appear
in any migration file, per the hard rule.

## Hard-rule compliance checklist

- [x] Named exports only (`up`/`down`) — no default exports.
- [x] No hand-edited generated code touched.
- [x] No secrets or PII values in migration files, fixtures, or this note.
- [x] Every migration has a real forward **and** rollback (table/type/
  extension/constraint drops that are true inverses — no production data
  exists yet, per data-plan §1.16's rollback-safety note, so destructive
  `down`s are acceptable at this phase; that note's "once live, additive-only"
  convention applies starting at migration `006`+ once any of these tables
  might hold real rows in a deployed environment).
- [x] UUIDv7 PKs, `timestamptz`, explicit FKs/`ON DELETE`, supporting indexes,
  constraints — present per table above.
- [x] `git commit` not attempted (permission-denied in this sandbox, per the
  brief) — files are staged; **a human must commit and push**.

## Open items carried forward to the PM / next gates

1. `teams` table now exists ahead of S2's feature work — S2 should build on
   it, not re-create it; flagged so the S2 dispatch doesn't duplicate
   `004_create_teams`.
2. `sessions` table deferred — revisit at S7 (reminders/notifications
   scheduled job) or S9 (retention-purge job) planning, per §0 addendum in
   `workspace/data-plan-todo-app.md`.
3. RLS for `memberships`/`teams` deferred to S2 (scoped-repository seam
   lands first); RLS for `users`/`oauth_identities`/`sessions` remains
   routed to security's deep review before Gate 5, per the engineer's and
   this agent's prior notes — restated, not newly decided, here.
4. KMS column-level encryption for `users.email`/`display_name` is schema-
   ready (plain columns, no blocking DDL) but the actual encryption wiring
   is devops/security scope before Gate 6 — not addressed by this migration
   set.
5. CI's `migrations` job (`.github/workflows/ci.yml`) already targets
   `npm --workspace @repo/api run migrate:up`/`migrate:down` against
   `migrations/` — no CI config changes were needed; the job was gated on
   `migrations/` existing and now it does.

---

NEXT: route to pm — S1 auth/session migrations (`001`-`005`: extensions,
users, oauth_identities, teams [minimal prerequisite], memberships) authored
to `migrations/` on `feature/s0-s1-foundation-auth`, staged (not committed —
permission-denied, human must commit) and not applied (no DB/registry
network in sandbox; CI's migrations job is the verifier); `sessions` table
deferred (no consumer in the built S1 code — Redis-only session store) and
RLS deferred for `memberships`/`teams` (scoped-repository GUC seam is S2
work; enabling RLS now would break `GET /api/me`) — both decisions and the
security-review routing for `users`/`oauth_identities`/`sessions` RLS are
recorded in this note and in `workspace/data-plan-todo-app.md` §0 | gate: none
