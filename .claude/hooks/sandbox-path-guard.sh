#!/usr/bin/env bash
# PreToolUse(Bash): redirect bare npm/turbo script runs to the sandbox-safe
# `make claude-*` targets. `npm run <script>` (and turbo, which shells out to
# it) hits EPERM under the Claude Code sandbox; the make targets invoke binaries
# directly. `npm install`, `npm dev`, and `npm exec` are unaffected and pass.

input=$(cat)

command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
if [ -z "$command" ]; then
  command=$(printf '%s' "$input" \
    | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
    | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//; s/"$//')
fi

# Catch: `npm run ...`, the script shortcuts (npm test|lint|typecheck|build|
# check|storybook|gen:client|test:e2e), and `turbo run`. Do NOT catch
# `npm install`, `npm dev`, `npm exec`, or `npm --filter ... exec ...`.
if printf '%s' "$command" \
  | grep -Eq '(^|[;&|[:space:]])(npm[[:space:]]+(run[[:space:]]|test|lint|typecheck|build|check|storybook|gen:client|test:e2e)|turbo[[:space:]]+run)'; then
  echo "BLOCKED: '$command' uses the npm/turbo script path, which hits EPERM under the Claude Code sandbox." >&2
  echo "Use the sandbox-safe make equivalent instead:" >&2
  echo "  gate:        make claude-check" >&2
  echo "  tests:       make claude-test | make claude-test-browser | make claude-test-e2e" >&2
  echo "  lint/types:  make claude-lint | make claude-typecheck" >&2
  echo "  build:       make claude-build" >&2
  echo "  codegen:     make claude-gen-client | make claude-routes" >&2
  exit 2
fi

exit 0
