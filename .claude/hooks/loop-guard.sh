#!/usr/bin/env bash
# Thrash detector. Scans the handoff log for the same work bouncing between the
# same two agents (e.g., QA <-> software-engineer on one bug) more than N times,
# and flags it so the PM escalates to a human instead of letting agents ping-pong.
#   loop-guard.sh [threshold]   (default 3)
# Exit 2 if a thrash loop is detected (lists the loops), else 0. Uses python3.
set -uo pipefail
THRESH="${1:-3}"
LOG="${HANDOFF_LOG:-workspace/handoff-log.md}"
command -v python3 >/dev/null 2>&1 || exit 0
[ -f "$LOG" ] || exit 0
THRESH="$THRESH" python3 - "$LOG" << 'PY'
import re, sys, os, collections
log = sys.argv[1]; thresh = int(os.environ["THRESH"])
ref_re = re.compile(r'(BUG-\d+|PR#?\d+|[A-Z]{2,}-\d+)')
to_re  = re.compile(r'->\s*([a-z-]+)')

# single-agent recurrence: (target, ref) -> count
counts = collections.Counter()
# bidirectional pair detection: ref -> ordered sequence of targets
sequences = collections.defaultdict(list)

for line in open(log):
    m = to_re.search(line)
    if not m: continue
    target = m.group(1)
    refs = ref_re.findall(line) or ["(no-ref)"]
    for r in refs:
        counts[(target, r)] += 1
        if r != "(no-ref)":
            sequences[r].append(target)

single_loops = [(k, c) for k, c in counts.items() if c > thresh and k[1] != "(no-ref)"]

# detect A->B->A->B bouncing for the same ref
pair_loops = []
for ref, seq in sequences.items():
    pair_counts = collections.Counter()
    for i in range(1, len(seq)):
        if seq[i] != seq[i-1]:
            pair = tuple(sorted([seq[i-1], seq[i]]))
            pair_counts[pair] += 1
    for pair, c in pair_counts.items():
        if c > thresh:
            pair_loops.append((ref, pair, c))

if single_loops or pair_loops:
    print("LOOP GUARD: thrash detected — escalate to a human instead of re-routing:")
    for (target, ref), c in sorted(single_loops, key=lambda x: -x[1]):
        print(f"  {ref} routed to {target} {c}x (> {thresh})")
    for ref, pair, c in sorted(pair_loops, key=lambda x: -x[2]):
        print(f"  {ref} bouncing between {pair[0]} <-> {pair[1]} {c}x (> {thresh})")
    sys.exit(2)
print("loop guard: no thrash")
PY
