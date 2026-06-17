#!/usr/bin/env bash
# Builds a throwaway git repo and runs the real verify.sh tamper check on a
# clean vs a tampering change. usage: tamper_repo.sh clean|dirty
set -euo pipefail
mode="${1:?clean|dirty}"
VERIFY="$(cd "$(dirname "$0")/../.." && pwd)/verify.sh"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
cd "$tmp"; git init -q; git config user.email e@e; git config user.name e
mkdir tests; printf "test('a',()=>{expect(1).toBe(1)})\n" > tests/a.test.js
git add -A; git commit -qm base; git branch -M main; git checkout -q -b feat
if [ "$mode" = dirty ]; then printf "it.only('x',()=>{})\n" >> tests/a.test.js
else printf "test('b',()=>{expect(2).toBe(2)})\n" >> tests/a.test.js; fi
git add -A; git commit -qm change
VERIFY_MODE=fast VERIFY_BASE=main bash "$VERIFY"
