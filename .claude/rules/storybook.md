---
paths:
  - "**/*.stories.tsx"
  - "apps/web/.storybook/**"
---

# Storybook

Authoring rules for `*.stories.tsx`. These reflect current Storybook 10 / CSF3
guidance — the existing story corpus predates them and is being migrated, so do
**not** copy patterns from older stories. This section governs.

## Rules

- **Args-first CSF3.** Every `meta` sets `component`. Use `args` for prop
  variations so Controls work and autodocs generate. Drop to a `render` function
  **only** for genuine composition (wrapping, multiple children). A render-only
  story with a `useState` wrapper is an anti-pattern reserved for genuinely
  controlled components — and even then prefer `args` + `fn()` where possible.
- **Callbacks are `fn()` spies.** Pass event handlers via `args` using `fn()`
  from `storybook/test` so interactions are assertable and logged in the
  Interactions panel.
- **Autodocs + JSDoc.** Every `meta` sets `tags: ['autodocs']`. Put a JSDoc block
  on the component (surfaces as the docs description); prop docs come from TS via
  `react-docgen-typescript`.
- **Explicit titles.** Set an explicit `title` using the fixed taxonomy:
  `UI/`, `Blocks/`, `A11y/`, `Features/`. Do not rely on auto-derived titles.
- **Typing.** `satisfies Meta<typeof Component>` on `meta`; `type Story =
  StoryObj<typeof meta>`. Bare `Meta` without `component` is disallowed.
- **Import surface.** `Meta`/`StoryObj` from `@storybook/react-vite`; test
  utilities (`expect`, `fn`, `userEvent`, `within`) from `storybook/test`.
  **Never** import `@testing-library/*` directly in a story.
- **Coverage tracks real state.** Write stories for the states the component
  actually supports (each `state` value, empty, disabled, error) plus edge cases
  that stress layout (long content / overflow, pseudo-locale / RTL). Do not force
  states a component doesn't have. See the checklist below.
- **`play` is encouraged, not required.** The render + a11y baseline is automatic
  (`addon-vitest` runs every story). Add an asserting `play` when a component owns
  **stateful/interactive logic that could silently break** — controlled
  open/close, selection, keyboard navigation, form submit, callback firing. Skip
  it for pure display components. When you write one: query by role through
  `canvas`, use `fn()` spies via `args`, and `await` every `userEvent`/`expect`.
- **A11y is non-negotiable.** `addon-a11y` runs in error mode; every story must
  pass axe. Fix violations by fixing markup/props — never by silencing the addon.
  A rule opt-out must be **story-scoped** `parameters.a11y` naming the specific
  rule ID **with a comment explaining why**; never global or component-wide. For
  `components/a11y/*`, the `.contract.md` order still governs (contract → tests →
  implementation).
- **Providers via decorators, kept presentational.** Global context (i18n, CSS,
  shared providers) lives in `.storybook/preview.tsx`. Feature stories needing
  server state or routing use a **fresh `QueryClient` and a memory router per
  story** via `meta.decorators`, with mock data supplied through `args` — no real
  network. Decorators are providers/layout only, no business logic. (Network
  mocking with MSW is deferred; flag it when a feature story first needs it.)
- **Brand theming is global.** A global **Brand** toolbar (`globalTypes.theme` +
  the `withTheme` decorator in `.storybook/`) sets `data-theme` on the document
  root; Fictiv is the default and every story renders under the active brand
  (see ADR-0001). New brand-bearing components must look correct and pass
  `addon-a11y` under **both** brands — check the toolbar before considering
  stories done. Brand token overrides live in `styles/themes/*.css`, not in
  stories.
- **Scope.** Stories are required for `components/ui`, `components/blocks`,
  `components/a11y`, and **presentational** `features/` components (view-model →
  props). Route/data-wiring containers are **not** storied — they are covered by
  Playwright e2e and integration tests. Division of labor: Storybook owns
  render + a11y + interaction; `*.browser.test.tsx` keeps its enumerated
  real-Chromium cases (focus restoration, layout/virtualization, color-contrast /
  focus-visible axe, native observers); Playwright owns cross-page flows. Prefer a
  `play` over a new browser-mode test when the behavior is component-scoped.
- **File mechanics.** Colocate `ComponentName.stories.tsx` beside the component,
  one story file per component.
- **Default-export carve-out.** `*.stories.tsx` are the one sanctioned exception
  to the named-exports-only rule (see `web-never-do.md`): `export default meta` is
  required by CSF. Do not "fix" a story by removing its default export.

## Canonical example

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { Button } from './button'

/**
 * Primary action button. Renders a native `<button>` with variant/size styling;
 * fires `onClick` on activation and is fully keyboard-operable.
 */
const meta = {
  title: 'UI/Button',
  component: Button,
  args: { children: 'Save changes', onClick: fn() },
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof Button>

export default meta

type Story = StoryObj<typeof meta>

// Args-only variant — Controls-editable, doubles as a render smoke test.
export const Default: Story = {}

export const Disabled: Story = {
  args: { children: 'Unavailable', disabled: true },
}

// Interaction test — stateful behavior that could silently break.
export const FiresOnClick: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Save changes' }))
    await expect(args.onClick).toHaveBeenCalledOnce()
  },
}
```

## Authoring checklist

Before considering a component's stories done, confirm you've covered the ones
that actually apply (skip those the component has no concept of):

- [ ] `Default` (args-only, Controls-editable)
- [ ] Each value of any `state`/variant prop (loading, empty, error, …)
- [ ] Disabled / read-only, if supported
- [ ] Error affordance, if the component surfaces one
- [ ] Long content / overflow (layout stress)
- [ ] Pseudo-locale / RTL, if text-bearing
- [ ] Focus / keyboard, if interactive
- [ ] An asserting `play` for stateful interaction that could silently break
- [ ] `tags: ['autodocs']` set and component has a JSDoc description
- [ ] Passes `addon-a11y` in error mode without silencing rules
