---
paths:
  - "apps/web/**"
---

# Never do (apps/web)

- **Don't add `.css` files outside `apps/web/src/styles/`.** Use Tailwind
  utilities; theme tokens live in `@theme` in `app.css`. Never add a
  `tailwind.config.js` (Tailwind v4 is CSS-first).
- **Don't manually copy shadcn components.** Use `npx shadcn@latest add <component>`
  (the `shadcn-add` skill covers this). Owned primitives live in
  `components/ui/` and are edited in place.
- **Don't runtime-validate first-party API responses with Zod.** Trust the
  generated types and contract tests. Zod is for _untrusted_ boundaries: forms,
  URL params, local storage, third-party webhooks.
- **Don't add new state libraries** (Redux, Jotai, MobX, zundo, …). See
  `state-management.md` for where each kind of state belongs.
- **Don't add auth, charts, table, or animation libraries without discussion** —
  those are deferred decisions. i18n is part of the frontend foundation; follow
  the established `i18next` setup (`i18n.md`).
- **Don't add default exports.** Route files export a named `Route`. **Exception:**
  `*.stories.tsx` files require `export default meta` per CSF — see `storybook.md`.
  Don't remove it.
- **Don't edit `apps/web/src/client/`**. Change `apps/api/openapi.yaml` and run
  `npm gen:client`.
- **Don't bump `@hey-api/openapi-ts` (or any codegen-input dep) without running
  `npm gen:client` and `npm typecheck` in the same change set.** Codegen tool
  and generated client are one pinned unit.
