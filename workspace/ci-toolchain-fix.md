# CI toolchain — S0/S1 (owner: devops-engineer)

**Date:** 2026-07-13 · **Branch:** `feature/s0-s1-foundation-auth`

---

## Toolchain baseline

Runtime: **Node 26 / npm 12.0.1** (ADR-0005). Declared in:
- Root `package.json` — `packageManager: "npm@12.0.1"`, `engines.node ">=26 <27"`, `engines.npm ">=12 <13"`
- `.nvmrc` — `26`
- `.github/workflows/ci.yml` — `node-version: "26"` + `npm i -g npm@12.0.1` in all jobs

npm is pinned explicitly in CI (via `npm i -g npm@12.0.1` after `setup-node`) to match
the `packageManager` field and ensure reproducible dependency resolution across all jobs.

---

## Lockfile

The lockfile (`package-lock.json`) is generated normally — `rm -f package-lock.json && npm install`
from the repo root — using Node 26 and npm 12.0.1. npm 12 resolves optional platform
dependencies correctly on all platforms (darwin and linux), so no special linux-only
regeneration is required.

**To regenerate locally:**

```bash
rm -f package-lock.json
npm install --no-audit --no-fund   # NO package argument — regenerates lock only
git add package-lock.json
git commit -m "chore: regenerate lockfile"
git push
```

---

## Vite pin

Vite is pinned at **5.4.x** (`apps/web/package.json`). Do NOT bump vite past 5.x
without a deliberate upgrade decision — vite 8 pulls rolldown's per-platform native
bindings which significantly complicates lockfile portability.

---

## Prevention

- **Never `npm install <pkg>` casually** — it rewrites `package.json` in place. Add
  a dep by hand-editing the manifest, then run `npm install` (no arg) to regen the
  lock only.
- **A lock-sync commit must show ZERO manifest diff.** Run
  `git diff --cached package.json apps/*/package.json` before any "sync lockfile" commit.
- **Don't bump vite past 5.x** without an explicit upgrade decision (see above).

---

## History

This file previously documented an extensive workaround for `npm/cli#4828`
(darwin-generated lockfiles missing linux-x64 optional deps for `@biomejs/cli-linux-x64`),
including a `lockfile-guard` CI job and a `regen-lockfile` workflow_dispatch workaround.
Those were removed on 2026-07-13 when the team upgraded to Node 26 / npm 12, which
resolves the cross-platform optional-dependency handling that caused the issue.
