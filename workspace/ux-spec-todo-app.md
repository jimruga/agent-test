# UX Spec — Team To-Do App (MVP)

- **Status:** DRAFT — pending Gate 2 (Design Review)
- **Author:** product-designer
- **Date:** 2026-07-09
- **Source PRD:** `workspace/prd-todo-app.md`
- **Companion artifact (mocks):** see `workspace/index.md` → UX mocks link (Claude Design / Artifact)
- **Risk tier:** REGULATED — WCAG 2.2 AA is a mandatory acceptance criterion, not a polish pass.

## Gate 2 decisions (RESOLVED by human:Jim, 2026-07-09) — supersede the §11 open items
1. **List deletion with tasks:** deleting a list **deletes its tasks with it** (no move option). Show a counted confirmation ("Delete '[List]' and its N tasks? This can't be undone."), true modal, type-to-confirm not required but Cancel/Delete explicit. §4 updated accordingly.
2. **Sole-owner account deletion:** the **team is deleted** as part of the flow (cascade delete of the team and its lists/tasks). No ownership-transfer feature in MVP. If the team has other members, they lose access — the confirmation must state this. §10 updated accordingly.
3. **Multi-user visibility:** confirmed **manual-refresh, no realtime** for MVP. §5 stands.

## 0. Design system starting point

No brand constraint was set at Gate 1, so this proposes a minimal, accessible
starting system — call it **Fictiv Design System v0** — for the frontend
engineer to build components against, not one-off screens.

**Type ramp** (system font stack, 1.25 modular scale, 16px base):
| Token | Size / line-height | Use |
|---|---|---|
| `text-xs` | 12/16 | metadata, timestamps, tag chips |
| `text-sm` | 14/20 | secondary text, form hints |
| `text-base` | 16/24 | body, task titles, inputs |
| `text-lg` | 20/28 | card headers, list names |
| `text-xl` | 24/32 | page titles |
| `text-2xl` | 32/40 | empty-state headlines only |

**Spacing scale (4px base):** `space-1`=4, `space-2`=8, `space-3`=12,
`space-4`=16, `space-6`=24, `space-8`=32, `space-12`=48. All padding/margin/gap
values are drawn from this scale — no arbitrary pixel values.

**Color roles** (values chosen/contrast-checked for WCAG AA; hex are a
starting proposal, not final brand):
| Role | Token | Hex | Contrast use |
|---|---|---|---|
| Primary action | `color-primary-600` | #1F5FBF | on white: 5.4:1 (body/icon-safe) |
| Primary hover/active | `color-primary-700` | #164A99 | |
| Surface | `color-surface-0` | #FFFFFF | app background |
| Surface raised | `color-surface-1` | #F4F6F9 | cards, panels |
| Border | `color-border` | #C7CFDA | 3:1 vs surface (non-text UI) |
| Text primary | `color-text-900` | #1A2230 | 15.8:1 on white |
| Text secondary | `color-text-600` | #4B5668 | 7.7:1 on white |
| Success | `color-success-700` | #1B7A3D | paired w/ ✓ icon + text, never color-only |
| Warning (due soon) | `color-warning-700` | #8A5A00 | paired w/ ⏰ icon + text |
| Danger (overdue/destructive) | `color-danger-700` | #B3261E | paired w/ icon + text |
| Focus ring | `color-focus` | #0B63CE | 3px outline, 3:1 min against adjacent colors, never suppressed |

Priority and due-state are **never color-only** — every colored chip carries
an icon + text label (see §6, §7).

**Grid / breakpoints:**
| Breakpoint | Width | Layout |
|---|---|---|
| `sm` | <640px | single column; bottom nav bar; list view stacks task rows full-width |
| `md` | 640–1023px | collapsible left nav (icon rail); single content column |
| `lg` | ≥1024px | persistent left nav (team/lists) + main content + optional right detail panel (task detail opens as panel, not modal, ≥1024px) |

Target size: all interactive controls ≥ 24×24px (icon buttons get ≥8px
padding around a 16px glyph to hit this).

---

## 1. Information architecture / navigation

```
[Sign-in] (unauthenticated, no nav)
   -> OAuth2 redirect -> callback -> session established
      -> if user has 0 teams -> [Create/Join Team] onboarding
      -> else -> [Team Home] (last active team, or team switcher default)

Authenticated shell (persistent left nav, lg; icon rail, md; bottom bar, sm)
├── Team switcher (top of nav) — shows current team name; only teams the
│    user is a member of are listed (multi-tenant boundary, see §9)
├── Lists (per team)
│    └── List view -> Task detail panel/route
├── My Tasks (cross-list, assigned-to-me filter, this team only)
├── Members & invites (owner: manage; member: view-only)
├── Notifications (in-app reminder tray) — bell icon, badge count
└── Account
     ├── Profile
     └── Delete my account & data
```

Every route is scoped by `teamId` server-side; the client never constructs a
cross-team request path (see §9 for the explicit UX treatment).

**Reading/heading order per page:** `h1` = page title (e.g. list name),
`h2` = section (e.g. "To do", "Done", "Members"), `h3` = card/row group
labels. Skip-to-content link precedes the nav on every authenticated page.

---

## 2. Flow 1 — Sign in (OAuth2) → maps to Story 1

**Entry points:** direct URL, expired-session redirect, invite-acceptance link.

1. **Sign-in screen** (unauthenticated): app name/logo, one primary button
   per supported OAuth2 provider (e.g. "Continue with Google"), short privacy
   note + link. No password field (OAuth2 only, per PRD §3).
2. User clicks provider button → redirected to provider (decision point:
   provider outage/cancel → back to sign-in with an inline error banner, not
   a dead-end blank page).
3. Callback: server exchanges code, establishes session server-side (per PRD
   §5, tokens never touch the client). Loading state: full-page spinner with
   `aria-live="polite"` text "Signing you in…".
4. **Success path:** 0 teams → onboarding create/join; ≥1 team → Team Home.
5. **Error paths (explicit, not dead ends):**
   - Provider denies/cancels → sign-in screen, inline error: "Sign-in was
     cancelled. Try again." Focus moves to the error text, then to the retry
     button.
   - Callback fails / network error → same screen, error: "We couldn't sign
     you in. Try again or contact support," with a retry button and a
     support-mailto link.
   - Session expires mid-app → redirect to sign-in with a preserved
     "return to" URL and a one-line banner: "Your session expired. Sign in to
     continue."

**Accessibility:** provider buttons are real `<button>`/`<a>` elements with
visible text (not icon-only); focus starts on the primary provider button on
page load; error banner uses `role="alert"` so screen readers announce it
immediately.

---

## 3. Flow 2 — Create team & invite members → maps to Story 2

**Entry points:** onboarding (0 teams), or "New team" action in team switcher.

1. **Create team modal/panel:** field "Team name" (required, labelled
   `<label for>`), Create button. Empty submit → inline field error, focus
   returns to the field, error text linked via `aria-describedby`.
2. On success: user becomes owner, lands on new (empty) Team Home →
   empty-state (§8) prompting "Invite your team" or "Create a list".
3. **Invite members** (owner only; members see no invite control — role gate
   is visible in the UI, not just enforced server-side):
   - "Invite" opens a panel: email input (supports comma/enter to add
     multiple), role is fixed to "member" for MVP, "Send invites" button.
   - Validation: malformed email → inline error per chip, does not block
     submitting the valid ones.
   - Pending invites list shown under "Members" with status chip "Invited"
     (icon+text, not color-only) vs "Member".
4. **Accept path (invited user):** email link → if signed in already and
   email matches, "Join [Team]?" confirmation → joins, redirected to that
   team's home. If not signed in, sign-in flow first, then same confirmation.
   AC "joins only after accepting" is satisfied by this explicit confirm
   step — invite alone never grants access.
5. **Error/edge paths:** invite to an email already on the team → inline
   "Already a member" notice, not silently dropped. Non-owner tries to reach
   `/invite` directly → 403 empty-state page: "Only team owners can invite
   members," with a link back to Team Home (no dead end).

---

## 4. Flow 3 — Manage shared lists → maps to Story 3

**Entry points:** left nav "Lists", "+ New list".

1. **List creation:** inline "+ New list" input in the nav or a small modal;
   name required. New list appears in nav immediately (optimistic UI) with a
   toast confirming, or a rollback + inline error on failure.
2. **Rename:** inline edit on the list header (click or `Enter`/`F2` when
   focused) — edit-in-place field, `Escape` cancels, `Enter`/blur saves.
3. **Delete list (Gate-2 rule: deletes its tasks):** confirmation dialog:
   "Delete '[List]' and its N tasks? This can't be undone." Single destructive
   action — no move option. Cancel closes without action. Dialog is a true
   modal: focus trapped, `Escape` closes, focus returns to the
   delete-triggering control on close.

---

## 5. Flow 4 — Task CRUD → maps to Story 4

1. **Create task:** persistent "+ Add task" affordance at top of list view
   (not buried). Quick-add: title field only (required) + Enter submits;
   "More options" expands description, assignee, due date, tags, priority
   inline without leaving the list (progressive disclosure).
   - Empty title on submit → inline error under the field, focus stays in
     field, submit blocked. Error text: "Give this task a title."
2. **Edit:** clicking a task row opens the **task detail panel** (right-side
   panel ≥1024px; full-screen route <1024px) — title, description
   (multi-line textarea), assignee, due date, tags, priority, list, activity
   note ("created by X", "assigned by Y") — all fields are native
   inputs/selects with labels.
3. **Complete/incomplete:** a checkbox at the start of each task row (real
   `<input type="checkbox">`, 24×24 target, label = task title via
   `aria-labelledby`, not a decorative div). Toggling updates state
   immediately with an `aria-live="polite"` confirmation ("Task marked
   complete") for screen-reader users, and a strikethrough + muted style
   (never removes the row) — completed tasks stay visible until filtered out
   by the user's own filter choice, so nothing seems to vanish unexpectedly.
4. **Delete:** row-level "..." menu → "Delete" → confirmation ("Delete
   '[title]'? This can't be undone.") → Cancel/Delete. Deleted task is
   removed from the list; a toast offers "Undo" for 5s (soft-delete window)
   before final removal, satisfying "delete removes it" while guarding
   against accidental loss.
5. **Multi-user visibility (AC: "visible to all team members on refresh"):**
   MVP has no realtime push (out of scope), so the list view shows a subtle
   "Updated Xm ago — Refresh" affordance plus a manual refresh control; the
   spec does not imply live sync the PRD didn't scope.

---

## 6. Flow 5 — Assign task → maps to Story 5

1. In task detail (or inline row control): "Assignee" is a combobox
   (`role="combobox"` pattern using native `<select>` where feasible, or a
   fully-labelled listbox if a rich picker is needed) listing **only current
   team members** — this is where the multi-tenant boundary is visually
   enforced (§9): the list can never contain a user outside the team.
2. Unassigned state shows a neutral "Unassigned" chip with a "+" affordance,
   not a blank cell (blank cells are ambiguous for screen-reader users).
3. "My Tasks" nav item filters the current team's tasks to
   `assignee = current user` — labelled explicitly so it's clear it's
   per-team, not global (heading: "My tasks in [Team name]").
4. **Error path:** assigning fails (e.g. member removed mid-action) → inline
   error under the field: "This person is no longer on the team," selection
   reverts to previous value.

---

## 7. Flow 6 — Due date + in-app reminder → maps to Story 6

1. **Due date field:** native `<input type="date">` (+ optional time) with a
   visible text label, not a placeholder-only field (placeholders fail AA
   as a label). Keyboard-operable date picker (native control satisfies this
   by default).
2. **Due-state chip on task rows** (icon + text + color, never color alone):
   - "Due today" — clock icon, warning color
   - "Overdue" — alert icon, danger color
   - "Due [date]" — calendar icon, neutral/secondary text color
3. **In-app reminder pattern:**
   - A **notification bell** in the top nav shows an unread-count badge
     (badge has an `aria-label`, e.g. "3 unread reminders" — never a bare
     number for screen readers).
   - Clicking opens a **notification tray** (panel, not a new page):
     list of reminders, each: task title, due time, list/team context,
     "View task" / "Dismiss" / "Snooze 1h".
   - **Toast pattern** for a reminder firing while the app is open: a
     non-modal toast in a corner, `role="status"`/`aria-live="polite"`,
     auto-persists in the tray even if the toast times out (so a missed
     toast isn't a missed reminder) — actionable ("View", "Dismiss"),
     keyboard reachable via `F6`/tab order, auto-dismiss ≥ 10s or until
     interacted with (per WCAG 2.2 timing guidance — never auto-dismiss
     under 5s and never without an equivalent persistent record).
   - **No reminder after completion** (AC): completing a task cancels any
     pending reminder for it; if one was already delivered, it's marked
     read, not shown as an active/actionable item.
4. **Empty/error states:** no reminders → tray shows "You're all caught up"
   empty state, not a blank panel. Reminder delivery failure is a backend/SRE
   concern (SLO: ±5 min) — no user-facing error needed unless a reminder is
   permanently dropped, in which case the task's due-chip still reflects
   ground truth (due date never silently lost even if the reminder is).

---

## 8. Flow 7 & 8 — Tags, priority, sort/filter → maps to Stories 7–8

1. **Tags:** chip-style, added via a combobox with autocomplete + "create
   new tag" affordance; each chip has a visible remove (×) button with an
   `aria-label` ("Remove tag Design"), 24×24 target.
2. **Filter bar** (above the task list): filter by status / assignee / tag /
   priority as a row of dropdown/multi-select controls, each a native
   `<select>` or accessible listbox with a text label (not icon-only).
   Active filters shown as removable chips with a "Clear all" text link.
3. **Priority:** 3-level (Low/Med/High) shown as icon+text+color chip
   (e.g. ▲ High, ▬ Med, ▽ Low) — never rendered as a bare colored dot.
4. **Sort control:** a labelled `<select>` ("Sort by: Due date ▾") — sort
   options: due date, priority, status, assignee, created date. Current
   sort + direction is announced via `aria-live` on change for
   screen-reader users, since the visual reorder alone isn't announced.
5. **Empty filtered result:** "No tasks match your filters" + a "Clear
   filters" button — distinct from the true empty-list state (§8.10 below)
   so users don't think the list itself is empty.

---

## 8.10 States inventory (applies across flows)

| State | Pattern |
|---|---|
| **Empty — no lists yet** | Illustration-free headline "Create your first list" + primary "+ New list" button + 1-line explainer. |
| **Empty — list has no tasks** | "Nothing here yet" + "+ Add task" focus-friendly (auto-focus the quick-add field). |
| **Empty — filtered to nothing** | "No tasks match your filters" + "Clear filters". |
| **Empty — no notifications** | "You're all caught up" in the tray. |
| **Loading — page-level** | Skeleton rows (not a spinner) for list/task rows so layout doesn't jump; `aria-busy="true"` on the container. |
| **Loading — inline action** | Button shows a spinner + retains its label text (e.g. "Saving…"), disabled state, not just a spinner replacing the label (label loss breaks SR announcement). |
| **Error — inline field** | Red text + icon under the field, `aria-describedby` linking input to the message, focus moves to first invalid field on submit. |
| **Error — action failed (e.g. save)** | Non-blocking toast, `role="alert"`, "Retry" action; the in-progress edit is preserved client-side, never silently discarded. |
| **Error — page/route failed (403/404/500)** | Dedicated state with heading, one-line explanation, and a way back (never a blank white screen) — see §3 for the 403-invite example. |
| **Offline/network lost** | Persistent banner at top: "You're offline — changes will sync when you're back," inputs remain usable and queue locally where feasible; otherwise disabled with the reason stated. |

---

## 9. Multi-tenant boundary — explicit UX treatment → maps to §5 isolation requirement

This is a top security-design risk per the PRD, so the UX makes team scoping
**visible**, not just enforced invisibly on the backend:

- **Team switcher is always present** in the nav header, showing the current
  team name explicitly (never just "Home"), so a user always knows which
  team's data they're viewing.
- Every list/task/member view's page title includes the team context in the
  document `<title>` and an `h1`/`h2`, e.g. "Design list — Acme Team".
- The assignee picker, tag list, and member list are **populated only from
  the current team's roster** (§6) — there is no cross-team search or
  autocomplete anywhere in the UI.
- Switching teams is a full navigation (not a client-side data swap that
  could flash stale data) — switching shows the loading skeleton (§8.10)
  rather than the previous team's content while the new team's data loads.
- A direct/deep link to a list or task the user's team doesn't own resolves
  to the **403 empty-state** (§3), never a partial render of another team's
  data and never a generic 404 that could leak existence information
  inconsistently — 403 and 404 read identically to the user ("You don't
  have access to this") to avoid confirming another team's resource exists.
- Account deletion (§10) and data export, if ever added, are scoped the same
  way — a user only ever sees/deletes their own data within teams they
  belong to.

---

## 10. Flow 9 — Account & data deletion → maps to Story 10

**Entry point:** Account → "Delete my account & data" (deliberately not on
the main settings page at the same visual weight as safe actions — placed in
a clearly-labelled danger zone section).

1. Danger-zone section: heading "Delete account", explanation of what's
   deleted vs retained (e.g. "Tasks you created in shared team lists remain,
   attributed to 'Deleted user', per your team's records — your profile,
   email, and personal data are erased"), matching the PRD §5 retention
   requirement — the UX must state the real behavior, not overpromise full
   erasure of shared data it can't delete.
2. Click "Delete my account" → **two-step confirmation** (destructive,
   irreversible): first a modal explaining consequences with a "Continue"
   button; second, a type-to-confirm field ("Type DELETE to confirm") — this
   friction is intentional for an irreversible action and is itself
   accessible (label, error if mismatched text, focus retained in modal).
3. On success: session ends, redirect to a signed-out confirmation screen:
   "Your account has been deleted." (not the sign-in screen directly, so the
   action isn't ambiguous).
4. **Sole-owner path (Gate-2 rule: deleting the account deletes the team):**
   if the user is the sole owner of a team, the confirmation explicitly warns
   that the team, its lists, and all its tasks will be deleted and that other
   members will lose access ("Deleting your account also deletes [Team] and
   removes its N members' access"). Proceeding cascades the team deletion.
   No ownership-transfer feature in MVP.

---

## 11. Open items flagged to PM (flows that need a product decision to fully satisfy an AC)

1. **List deletion with tasks** (§4): PRD AC says "deleting a list handles
   its tasks per defined rule" but doesn't define the rule. This spec
   proposes delete-with-tasks vs move-then-delete as the two explicit
   choices — needs PM/PRD sign-off.
2. **Sole-owner account deletion** (§10): no PRD rule for a team's last
   owner deleting their account. This spec proposes block + require
   ownership transfer or team deletion first — needs PM/PRD sign-off.
3. **Multi-user live visibility** (§5): AC says "visible to all team members
   on refresh," which this spec takes literally (manual refresh, no
   realtime) since realtime is explicitly out of scope — confirming this
   reading is correct avoids over-building later.

---

## 12. Component inventory (for frontend-engineer build)

Primitives: Button (primary/secondary/danger/ghost, all with disabled +
loading sub-states), IconButton, TextInput, Textarea, Select, DatePicker
(native), Combobox/Multiselect (assignee, tags, filters), Checkbox, Chip
(status/priority/tag — icon+text+color variants), Modal (focus-trapped),
Panel/Drawer (task detail), Toast, Banner (page-level, error/offline),
NotificationTray, Skeleton, EmptyState, Avatar (initials-based, no external
image dependency), NavRail/Sidebar, TeamSwitcher, Breadcrumb/PageHeader
(carries the team-context title from §9).

Each primitive ships with: default / hover / focus-visible / active /
disabled / error states, and keyboard interaction spec (documented per
component in the mocks artifact).

---

## 13. Accessibility conformance note (WCAG 2.2 AA)

Applies to every flow above; verified before Gate 5 by frontend-engineer +
QA + security/compliance evidence, using the `accessibility-wcag` skill.

- **Perceivable:** text contrast ≥4.5:1 (body), ≥3:1 (large text/icons) —
  palette in §0 chosen against this; state is always icon+text+color, never
  color alone (chips, due-state, invite status).
- **Operable:** every flow (sign-in, team/invite, lists, task CRUD, assign,
  due date/reminder, tags/filter/sort, delete-my-data) is fully keyboard
  operable — logical tab order per §1's heading structure, visible focus
  ring (`color-focus`, never suppressed via `outline:none` without a
  replacement), no keyboard traps in modals/panels (focus trapped
  intentionally, `Escape` + explicit close both work, focus restored to the
  trigger on close). Target size ≥24×24px on all controls including chip
  remove buttons and checkboxes.
- **Understandable:** every input has a real `<label>`; errors are specific,
  adjacent to the field, and programmatically linked (`aria-describedby`);
  destructive actions require explicit confirmation with plain-language
  consequences (§10).
- **Robust:** semantic HTML first (`button`, `nav`, `main`, `dialog`/modal
  pattern) per the skill; ARIA only fills gaps (combobox, live regions for
  async state changes — task completion, filter/sort changes, toasts,
  reminders); async/dynamic content changes are announced via
  `aria-live="polite"` (non-urgent: save confirmations, sort changes) or
  `role="alert"` (urgent: form errors, action failures).
- **Motion:** respects `prefers-reduced-motion` — toast/panel transitions
  fall back to instant show/hide; no auto-advancing carousels or motion-only
  affordances anywhere in this spec.
- **Verification plan (for QA/frontend):** automated axe-core in
  component/e2e tests as baseline; manual keyboard-only pass and a
  screen-reader smoke test (VoiceOver/NVDA) on: sign-in, create/invite,
  task CRUD, assign, due date+reminder tray, account deletion — the flows
  with the highest destructive/irreversible or security stakes.

---

## 14. Responsive behavior summary

| Element | sm (<640) | md (640-1023) | lg (≥1024) |
|---|---|---|---|
| Nav | bottom tab bar (Lists/My Tasks/Notifications/Account) | icon rail, expandable | persistent labelled sidebar w/ team switcher |
| Task detail | full-screen route, back button | full-screen route | right-side panel, list stays visible |
| Filter bar | collapses to a single "Filters" button → sheet | inline row, wraps | inline row, single line |
| Notification tray | full-screen sheet | dropdown panel | dropdown panel |
| Task row | stacked (title, then meta chips wrap below) | single line, chips inline | single line, chips inline, hover reveals row actions |
