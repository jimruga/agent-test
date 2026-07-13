#!/usr/bin/env bash
# Single source of truth for "verified." Invoked IDENTICALLY by the local verify
# hook and by CI, so they can never disagree. Exit 0 only if every check passes.
# Agents do NOT assert pass/fail — this script decides, and CI runs it where the
# agent has no write access.
#
# Modes:  VERIFY_MODE=fast  -> tamper check + lint/typecheck if deps present (local hook)
#         VERIFY_MODE=full  -> installs + lint + typecheck + tests + coverage (CI; default)
# VERIFY_BASE (default origin/main) is the diff base for the tamper check.
# Coverage is enforced by the runners themselves (jest coverageThreshold /
# pytest --cov-fail-under=$MIN_COVERAGE), so a passing run is a covered run.

set -uo pipefail
MODE="${VERIFY_MODE:-full}"
BASE="${VERIFY_BASE:-origin/main}"
MIN_COVERAGE="${MIN_COVERAGE:-80}"
fails=0
run() { echo "── $1"; if "${@:2}"; then echo "   ok"; else echo "   FAIL: $1"; fails=$((fails+1)); fi; }

# ── Anti-gaming: no test tampering introduced in this change ──────────────
# Catches the "make it green by disabling tests" move: added skips, exclusive
# .only blocks (which silently disable every OTHER test), and deleted test files.
tamper_check() {
  echo "── tamper check (no disabled/deleted tests)"
  local diff added deleted
  # Scan ONLY test-file changes — the control is about disabled/deleted TESTS.
  # Restricting the diff by pathspec prevents false positives from non-test code
  # (e.g. process.exit in an entrypoint) and from edits to this control itself.
  tp=('*.test.*' '*.spec.*' '*_test.*' 'test_*.py' '*/tests/*' '*/__tests__/*')
  diff="$(git diff --unified=0 "$BASE"...HEAD -- "${tp[@]}" 2>/dev/null || git diff --unified=0 "$BASE" -- "${tp[@]}" 2>/dev/null || true)"
  added="$(printf '%s\n' "$diff" | grep -E '^\+' \
    | grep -Ei '(\.only\()|(it\.only)|(describe\.only)|(test\.only)|(\.skip\()|(\bxit\()|(\bxdescribe\()|(@pytest\.mark\.(skip|xfail))|(@unittest\.skip)|(\bt\.Skip(Now)?\b)' || true)"
  deleted="$(git diff --name-status "$BASE"...HEAD 2>/dev/null | grep -E '^(D|R)' | grep -Ei '(\.test\.|\.spec\.|_test\.|test_.*\.py|/tests?/)' || true)"
  if [ -n "$added" ] || [ -n "$deleted" ]; then
    echo "   FAIL: test tampering detected"
    [ -n "$added" ]   && { echo "   added skip/only markers:"; printf '%s\n' "$added"   | sed 's/^/     /'; }
    [ -n "$deleted" ] && { echo "   removed test files:";      printf '%s\n' "$deleted" | sed 's/^/     /'; }
    echo "   -> Obsolete tests are removed in a separate, reviewed commit with rationale — never inside a fix."
    fails=$((fails+1))
  else echo "   ok"; fi
}

# ── JavaScript / TypeScript monorepo (npm workspaces: apps/*, packages/*) ──────
# The root package.json defines the workspaces and the aggregate scripts
# (typecheck/lint/test). Coverage thresholds are enforced by the test runner
# itself (vitest coverage.thresholds), so a passing `npm test` is a covered run.
if [ -f package.json ] && grep -q '"workspaces"' package.json; then
  echo "## monorepo (node / npm workspaces)"
  if [ "$MODE" = "full" ]; then run "install" npm ci --no-audit --no-fund; fi
  if [ "$MODE" = "full" ] || [ -d node_modules ]; then
    run "typecheck" npm run typecheck
    run "lint" npm run lint
  else echo "   (fast mode, deps not installed — lint/typecheck deferred to CI)"; fi
  if [ "$MODE" = "full" ]; then run "test+coverage" npm test; fi
fi

# ── Python areas (Lambdas / services) ─────────────────────────────────────
if ls **/pyproject.toml requirements*.txt >/dev/null 2>&1; then
  echo "## python"
  command -v ruff >/dev/null && run "py: lint(ruff)" ruff check .
  command -v mypy >/dev/null && run "py: typecheck"  mypy .
  if [ "$MODE" = "full" ] && command -v pytest >/dev/null; then run "py: test+coverage" pytest --cov --cov-fail-under="$MIN_COVERAGE" -q; fi
fi

# ── Infrastructure (CloudFormation) ───────────────────────────────────────
if ls infrastructure/*.y*ml infrastructure/*.json >/dev/null 2>&1; then
  echo "## infrastructure"
  command -v cfn-lint >/dev/null && run "infra: cfn-lint" cfn-lint infrastructure/
fi

tamper_check
echo
if [ "$fails" -eq 0 ]; then echo "VERIFY: PASS (mode=$MODE)"; exit 0
else echo "VERIFY: FAIL — $fails check(s) failed (mode=$MODE)"; exit 1; fi

