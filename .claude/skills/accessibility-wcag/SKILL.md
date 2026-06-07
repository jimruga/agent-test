---
name: accessibility-wcag
description: WCAG 2.2 AA accessibility practices for designing and building UI. Use whenever producing UX specs, mocks, or React components so accessibility is built in, not bolted on. Shared by the product designer and frontend engineer.
---

# Accessibility (WCAG 2.2 AA)

Treat accessibility as an acceptance criterion, not a later pass.

## Design-time
- Color contrast: 4.5:1 for body text, 3:1 for large text and UI components/icons.
- Never use color alone to convey state — pair with text, icon, or pattern.
- Define focus, hover, error, empty, and loading states for every interactive element.
- Target sizes ≥ 24x24 CSS px; provide visible focus indicators.
- Specify logical reading/tab order and heading hierarchy in the spec.

## Build-time
- Use semantic HTML first (`button`, `nav`, `main`, `label`); reach for ARIA only to fill gaps, and prefer native elements over `div`+role.
- Every input has an associated `<label>`; group related controls with `fieldset`/`legend`.
- Manage focus on route changes, modal open/close, and dynamic content; trap focus in dialogs and restore it on close.
- All functionality operable by keyboard alone; no keyboard traps.
- Provide `alt` text for meaningful images, empty `alt` for decorative ones.
- Announce async changes with `aria-live` where appropriate.

## Verify
- Automated: axe-core in component/e2e tests as a baseline (catches ~30–40%).
- Manual: keyboard-only pass and a screen-reader smoke test (VoiceOver/NVDA) on key flows.
- Respect `prefers-reduced-motion`.
