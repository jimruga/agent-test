---
paths:
  - "apps/web/**"
---

# Where state goes (apps/web)

Pick the narrowest home for each kind of state. Don't add new state libraries.

- **Route params** → TanStack Router.
- **Search params** → TanStack Router, or **nuqs** for complex search state
  (the BOM table's search/filter/sort is URL-backed and must round-trip on refresh).
- **Form state** → React Hook Form (+ `zodResolver`, `mode: 'onTouched'`). See `forms.md`.
- **Server cache** → TanStack Query (via the `@/lib/api` shim).
- **Global client state** → Zustand 5, used **sparingly** — prefer Query.
- **Undoable state** → a **feature-scoped Zustand store with explicit
  `past`/`future` arrays**. Reference: `apps/web/src/features/interventions/draftStore.ts`.
  Do **not** introduce `zundo`; revisit only when a second undo-bearing feature lands.

Intervention-edit acceptance bar: undo/redo survives re-render, and local edits
do **not** update the TanStack Query cache until save.
