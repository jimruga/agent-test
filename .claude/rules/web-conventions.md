---
paths:
  - "apps/web/**"
---

# Web conventions (apps/web)

Layout — `features/<name>/` is **the unit of work**:

```
apps/web/src/
├── app/          Providers, error boundaries, app entry helpers
├── routes/       TanStack Router file-based routes (__root.tsx, index.tsx, ...)
├── features/     Vertical slices — THE UNIT OF WORK
├── components/
│   ├── ui/       shadcn primitives — owned code; compose, don't rewrite
│   └── blocks/   Product compositions built from ui/ primitives
├── lib/          Utilities (cn helper, the @/lib/api shim, i18n, formatting)
├── hooks/        Cross-feature hooks
├── styles/
│   ├── app.css   Tailwind v4 @import + @theme + shadcn CSS vars
│   └── themes/   Per-brand token overrides ([data-theme] blocks)
└── client/       GENERATED OpenAPI client — never hand-edit
```

- A feature owns its types, API hooks, components, stories, tests, and barrel
  export. Touch only that folder when adding behavior. Import a feature only via
  its `index.ts` barrel — never `features/foo/internal/...`. (Use the
  `feature-slice` skill to scaffold one.)
- **`components/ui/` is shadcn** — checked-in, owned code. Extend in place; don't
  fork elsewhere. Add new primitives with `npx shadcn@latest add` (see the
  `shadcn-add` skill), never by hand-copying.
- **`components/blocks/`** is for product compositions built from `ui/` primitives.
- **`@/*` path alias** maps to `apps/web/src/*`. Always import via the alias —
  never relative paths that climb past a feature boundary.

Data & types:

- **Server data fetching goes through the shim.** Import generated
  query/mutation option helpers from `@/lib/api` (which wraps
  `apps/web/src/client/@tanstack/...` with `ExactOptionalize<T>` to satisfy
  `exactOptionalPropertyTypes`). App code must **not** import directly from
  `@/client/@tanstack/...`.
- Normalize generated API types into a feature view model before passing to
  components — generated type → feature view model → narrow component props.
- **Optional props from form/hook outputs use `error?: T | undefined`**, not
  `error?: T`. Under `exactOptionalPropertyTypes` these differ: `T | undefined`
  accepts `error={form.errors.foo?.message}` cleanly. Use `error?: T` only when
  the prop genuinely must not accept undefined. This is a receiver-side choice.

Styling & routing:

- **Tailwind v4 is CSS-first** via `@theme` in `apps/web/src/styles/app.css`.
  There is no `tailwind.config.js` and there should never be one — keep tokens in
  CSS. Don't add `.css` files outside `apps/web/src/styles/`; use utilities.
- **Brand theming.** Base tokens (shadcn `:root`/`.dark`, badge/motion palettes)
  and the `@theme inline` mapping live in `app.css`; **per-brand overrides** live
  in `apps/web/src/styles/themes/*.css` keyed by `[data-theme="<brand>"]` and
  `@import`ed from `app.css`. A brand overrides only brand-owned tokens
  (`--primary`, `--primary-foreground`, `--ring`) — everything else inherits.
  See ADR-0001.
- **Routes are file-based.** A new route is a new file in
  `apps/web/src/routes/`, not a `<Route path>` JSX element. Route files export a
  named `Route` from `createFileRoute(...)`. Run `make claude-routes` after route
  changes.
- Icons come from `lucide-react`. Toasts come from Sonner (the shadcn wrapper).
