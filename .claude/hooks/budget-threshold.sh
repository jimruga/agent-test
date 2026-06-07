#!/usr/bin/env bash
# Budget-threshold hook for the agent team.
#
# Two modes (the same script, different arg):
#   update  -> wired to SubagentStop + Stop. Recomputes total token usage from
#              the session transcripts, writes it to workspace/budget.json, and
#              posts a Slack alert when a 25/50/75/90% threshold is first crossed.
#   check   -> wired to PreToolUse(matcher: Agent). Blocks spawning a new subagent
#              (exit 2) once usage reaches the hard cap, so work pauses until a
#              human raises `allocated_tokens` / `hard_cap_tokens`.
#
# Requires: jq, and (optional) curl + SLACK_BUDGET_WEBHOOK env var for Slack.
# Notes: token fields in Claude Code transcripts can vary by version — verify with
# `claude --debug` and adjust the jq usage paths below if your totals look off.

set -euo pipefail
MODE="${1:-update}"
BUDGET_FILE="${BUDGET_FILE:-./workspace/budget.json}"
INPUT="$(cat || true)"

# Fail open: never break the session if tooling/config is missing.
command -v jq >/dev/null 2>&1 || { echo "budget hook: jq not found, skipping" >&2; exit 0; }
[ -f "$BUDGET_FILE" ] || { echo "budget hook: $BUDGET_FILE not found, skipping" >&2; exit 0; }

alert() { # $1 = message
  echo "BUDGET: $1"
  if [ -n "${SLACK_BUDGET_WEBHOOK:-}" ] && command -v curl >/dev/null 2>&1; then
    curl -fsS -X POST -H 'Content-type: application/json' \
      --data "$(jq -nc --arg t ":moneybag: $1" '{text:$t}')" \
      "$SLACK_BUDGET_WEBHOOK" >/dev/null 2>&1 || true
  fi
}

if [ "$MODE" = "check" ]; then
  used=$(jq -r '.used_tokens // 0' "$BUDGET_FILE")
  cap=$(jq -r '.hard_cap_tokens // 0' "$BUDGET_FILE")
  if [ "$cap" -gt 0 ] && [ "$used" -ge "$cap" ]; then
    echo "Token build budget exhausted (${used}/${cap}). A human must approve more tokens: raise allocated_tokens / hard_cap_tokens in ${BUDGET_FILE}." >&2
    exit 2   # blocks the Agent spawn
  fi
  exit 0
fi

# ---- update mode ----
tp=$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || true)
[ -n "$tp" ] && [ -f "$tp" ] || { echo "budget hook: no transcript_path, skipping" >&2; exit 0; }

sum_file() { # sum token usage in one JSONL transcript
  jq -s '[.[] | (.message.usage // empty)
          | ((.input_tokens//0)+(.output_tokens//0)
             +(.cache_read_input_tokens//0)+(.cache_creation_input_tokens//0))]
         | add // 0' "$1" 2>/dev/null || echo 0
}

total=$(sum_file "$tp")
session_dir=$(dirname "$tp")
if [ -d "$session_dir/subagents" ]; then
  for f in "$session_dir"/subagents/agent-*.jsonl; do
    [ -e "$f" ] || continue
    total=$(( total + $(sum_file "$f") ))
  done
fi

allocated=$(jq -r '.allocated_tokens // 0' "$BUDGET_FILE")
prev=$(jq -r '(.thresholds_alerted // [])' "$BUDGET_FILE")

# write the new total
tmp=$(mktemp)
jq --argjson used "$total" '.used_tokens = $used' "$BUDGET_FILE" > "$tmp" && mv "$tmp" "$BUDGET_FILE"

[ "$allocated" -gt 0 ] || exit 0
pct=$(( total * 100 / allocated ))

for th in 25 50 75 90; do
  already=$(printf '%s' "$prev" | jq --argjson t "$th" 'index($t) != null')
  if [ "$pct" -ge "$th" ] && [ "$already" = "false" ]; then
    alert "build budget at ${pct}% (${total}/${allocated} tokens) — crossed ${th}% on feature $(jq -r '.feature // "?"' "$BUDGET_FILE")"
    tmp=$(mktemp)
    jq --argjson t "$th" '.thresholds_alerted = ((.thresholds_alerted // []) + [$t] | unique)' "$BUDGET_FILE" > "$tmp" && mv "$tmp" "$BUDGET_FILE"
    prev=$(jq -r '(.thresholds_alerted // [])' "$BUDGET_FILE")
  fi
done

if [ "$pct" -ge 100 ]; then
  alert "build budget EXCEEDED at ${pct}% — new subagent dispatch will be blocked until a human raises the allocation."
fi
exit 0
