---
paths:
  - "**/*.browser.test.tsx"
---

# Browser-mode tests

Tests are **filename-tagged**. `*.browser.test.tsx` runs under real Chromium via
the `browser` Vitest project; plain `*.test.tsx` uses jsdom.

Opt into Browser Mode **only** when the test exercises something jsdom can't do
faithfully:

- focus restoration or multi-keystroke keyboard sequences,
- layout (`getBoundingClientRect`, scroll, virtualization),
- axe rules that need real CSS (`color-contrast`, `focus-visible`),
- native APIs jsdom mocks poorly (IntersectionObserver, ResizeObserver).

Otherwise keep it a plain `*.test.tsx` (jsdom) — browser tests are slower.

Run browser tests with `make claude-test-browser` (or the low-noise
`make claude-test-browser-quiet`). Plain unit tests run under `make claude-test`.
