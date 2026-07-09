#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit): non-blocking reminders when a generated
# artifact's *source* changes, so the committed generated output doesn't drift.
# Never blocks (exit 0); surfaces a reminder to Claude via additionalContext.

input=$(cat)

file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
if [ -z "$file_path" ]; then
  file_path=$(printf '%s' "$input" \
    | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
    | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//; s/"$//')
fi

msg=""
case "$file_path" in
  *apps/api/openapi.yaml)
    msg="You edited apps/api/openapi.yaml (the API contract). Regenerate the web client with 'make claude-gen-client', then 'make claude-typecheck'." ;;
  *apps/web/src/routes/*)
    msg="You changed a route file under apps/web/src/routes/. Regenerate the route tree with 'make claude-routes' (updates routeTree.gen.ts)." ;;
esac

if [ -n "$msg" ]; then
  if command -v jq >/dev/null 2>&1; then
    printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":%s}}\n' \
      "$(printf '%s' "$msg" | jq -R -s '.')"
  else
    echo "$msg" >&2
  fi
fi

exit 0
