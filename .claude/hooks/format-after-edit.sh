#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit): best-effort Biome format + safe autofix on
# the file Claude just touched, so the working tree stays clean mid-session
# (matches the husky/lint-staged `biome check --write` gate at commit time).
# Best-effort: never fails the tool call. Biome's own config excludes generated
# paths (src/client, routeTree.gen.ts), so they are left untouched.

input=$(cat)

file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
if [ -z "$file_path" ]; then
  file_path=$(printf '%s' "$input" \
    | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
    | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//; s/"$//')
fi

[ -z "$file_path" ] && exit 0
[ -f "$file_path" ] || exit 0

case "$file_path" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.jsonc|*.css|*.md|*.yaml|*.yml)
    biome_bin="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin/biome"
    [ -x "$biome_bin" ] || biome_bin="node_modules/.bin/biome"
    if [ -x "$biome_bin" ]; then
      "$biome_bin" check --write --no-errors-on-unmatched "$file_path" >/dev/null 2>&1 || true
    fi
    ;;
esac

exit 0
