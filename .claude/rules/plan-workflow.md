# Plan workflow

Every plan that the user approves (exits plan mode on) must be filed into
`claude-feature-notes/` before execution begins. This directory is the durable
record of _why_ features were built; git history covers _what_ changed.

**Filename**: `YYYY-MM-DD-<kebab-case-summary>.md` — current date, then a
kebab-case description (e.g. `2026-05-04-add-latin-translation-mode.md`, not
`plan-3.md`). If the name exists, append a disambiguator (`-v2`, `-followup`) —
never overwrite.

**Frontmatter** (YAML, required):

```yaml
---
date: YYYY-MM-DD
title: <one-line summary of the work>
prompts:
  - |
    <verbatim user message 1 that led to the plan>
  - |
    <verbatim user message 2, if any>
---
```

**Body**: the approved plan content (Context + Plan sections). Include every
user prompt from the planning conversation in the `prompts:` list, in order,
verbatim (preserve line breaks via `|`).

Treat the directory as **append-only** — do not delete entries when a feature
ships. Update entries in place only to correct mistakes or add a brief
post-mortem note.
