#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit): hard-block edits to generated files.
# Generated code is regenerated from source, never hand-edited. Exit 2 blocks
# the tool call and feeds stderr back to Claude.

input=$(cat)

file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
if [ -z "$file_path" ]; then
  file_path=$(printf '%s' "$input" \
    | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
    | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//; s/"$//')
fi

case "$file_path" in
  *apps/web/src/client/*|*routeTree.gen.ts)
    echo "BLOCKED: '$file_path' is generated code and must not be hand-edited." >&2
    echo "Regenerate instead:" >&2
    echo "  - apps/web/src/client/**  -> edit apps/api/openapi.yaml, then 'make claude-gen-client'" >&2
    echo "  - routeTree.gen.ts        -> 'make claude-routes'" >&2
    exit 2
    ;;
esac

exit 0
