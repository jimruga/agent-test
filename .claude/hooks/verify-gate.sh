#!/usr/bin/env bash
# Local fast-fail backstop (advisory). On a subagent/turn stop, if code changed,
# run the FAST verification (tamper check + lint/typecheck if deps are present)
# and block (exit 2) on failure so the agent can't end its turn claiming "done"
# on work that doesn't pass. This shortens the loop — but it is NOT the binding
# gate: a local hook lives in the agent's trust domain. The binding gate is CI +
# branch protection, which the agent cannot bypass.
set -uo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-.}"
cd "$ROOT" || exit 0
[ -x ./verify.sh ] || exit 0

# Only bother if code (not docs/workspace) changed.
changed="$(git status --porcelain 2>/dev/null | grep -Ei '\.(js|jsx|ts|tsx|py|sql|ya?ml|json)$' | grep -Eiv '(workspace/|examples/|\.md$)' || true)"
[ -n "$changed" ] || exit 0

out="$(VERIFY_MODE=fast ./verify.sh 2>&1)"; rc=$?
if [ "$rc" -ne 0 ]; then
  echo "Local verification failed — do not report this work as done. Fix it (do not disable tests) and re-run ./verify.sh:" >&2
  echo "$out" | tail -n 20 >&2
  exit 2
fi
exit 0
