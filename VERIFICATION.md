# Verification — making "done" mean done

The team's weakest point is trust: an agent will report "tests pass," "passes QA,"
or "deployed and healthy" whether or not it's true, and under pressure to make a
test pass it will delete or disable the test. This document is how we replace
narrative with machine-verified ground truth.

## Principle: gate where the agent cannot write

A check the agent runs (a local script, its own summary) lives in the agent's
trust domain — it can skip it, misread it, or game it. A check enforced by GitHub
**branch protection** lives outside that domain: the agent cannot merge a PR whose
required checks aren't green, full stop. So the binding gate is server-side, not a
hook.

## Three layers

1. **One definition of "verified" — `verify.sh`.** Lint, typecheck, tests,
   coverage (enforced by the runners' own thresholds), and an anti-tamper diff
   check. Run identically locally (`VERIFY_MODE=fast`) and in CI (`full`), so they
   can never disagree. This is the same single-source pattern as gitleaks.
2. **CI runs the unfakeable parts** — `.github/workflows/ci.yml`: the full
   `verify.sh`, a real **migration apply + rollback** against an ephemeral Postgres
   (proves the migration works, not that an agent thinks it will), and the secret
   scan. They roll up into one required check: `all-green`.
3. **Branch protection makes it binding** — `scripts/setup-branch-protection.sh`:
   `all-green` required, branch up-to-date, one approving review, and
   `require_last_push_approval` so **the agent that pushed cannot approve its own
   merge** (the seed of segregation of duties). Stale reviews dismissed,
   conversations resolved, linear history, no force-push, admins included.

A local advisory hook (`.claude/hooks/verify-gate.sh`) runs the fast checks on a
subagent stop and blocks the turn if code changed and fast-verify fails — useful
for a tight loop, but explicitly *not* the binding control.

## Anti-gaming

The tamper check fails the build if the diff adds `.skip` / `xit` / `@pytest.mark.skip`
/ `@unittest.skip`, adds `.only` (which silently disables every sibling test), or
deletes/renames-away test files. Coverage is enforced by `jest coverageThreshold`
and `pytest --cov-fail-under`, so a green run is a covered run. Obsolete tests are
removed only in a separate, reviewed commit with rationale — never inside a fix.

## How it maps to the human gates

- **Gate 2 (code + migration):** the PM requests it only when `all-green` is green;
  branch protection enforces no merge without it + an independent review. The human
  approves against the green checks and the diff, not a prose summary.
- **Gate 3 (deploy):** "deployed to staging" is proven by an automated post-deploy
  health/smoke check that hits the live environment, wired to auto-rollback on
  failure. DevOps cites the check result.
- **Gate 5 (acceptance):** acceptance criteria map to acceptance-tagged tests where
  possible, so "meets AC1–AC6" is backed by a passing run.
- Every approval records the **commit SHA + check result** in `handoff-log.md`.

## Setup (once per repo)

1. Configure each area's runner to fail on coverage (`coverageThreshold` in
   `package.json`; `--cov-fail-under` already passed for pytest) and expose
   `lint` / `typecheck` npm scripts.
2. Wire the migration runner into the `migrations` CI job (apply + rollback).
3. Push once so CI runs and registers the `all-green` check.
4. `./scripts/setup-branch-protection.sh <owner> <repo> main`.
5. Add a `CODEOWNERS` file + a ruleset requiring owner review on `migrations/` and
   `infrastructure/` for stronger separation of duties.

## Honest limits

- This proves the **declared** tests pass and weren't tampered with; it does not
  prove the tests are *good*. Pair it with mutation testing or periodic human test
  review to guard against vacuous tests.
- The local hook is advisory; only CI + branch protection are binding.
- Coverage % is a floor, not a quality guarantee — a high number with weak
  assertions still passes. Treat coverage as necessary, not sufficient.
