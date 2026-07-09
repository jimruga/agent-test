---
paths:
  - "apps/web/src/features/**"
  - "apps/web/src/components/blocks/FormField*"
---

# Forms (React Hook Form + Zod)

- **Zod schemas live in the feature**, with the TypeScript type _inferred_ via
  `z.infer`. Don't write a parallel hand-typed interface alongside the schema.
- **Zod 4 + RHF**: import Zod from `zod/v4`, use `@hookform/resolvers/zod`, and
  pass the schema directly — don't re-wrap it.
- Use `useForm({ resolver: zodResolver(schema), mode: 'onTouched' })`.
- **Optional error props are `error?: T | undefined`** (not `error?: T`) so
  `error={form.formState.errors.foo?.message}` type-checks under
  `exactOptionalPropertyTypes`. This is a receiver-side decision on the component.
- **Forms dependency group** — `react-hook-form`, `@hookform/resolvers`, and
  `zod` are pinned to exact versions. Do not bump one without checking all three,
  then run `make claude-typecheck` and at least one form test under Node 24.
- Local form/draft edits must **not** update the TanStack Query cache until save
  (see `state-management.md` for undo/redo).
- Zod is for **untrusted boundaries** (forms, URL params, storage, third-party) —
  never for validating first-party API responses.
