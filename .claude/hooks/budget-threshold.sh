#!/usr/bin/env bash
# Budget-threshold hook. Two modes (same script):
#   update -> SubagentStop/Stop: recompute total token usage from the session
#             transcripts, write to budget.json, Slack-alert on first crossing of
#             25/50/75/90%.
#   check  -> PreToolUse(Agent): block (exit 2) once usage reaches the hard cap.
# Uses python3 (no jq). Slack alerts sent only if SLACK_BUDGET_WEBHOOK is set.
# Fails open if python3 or the budget file is missing.
set -uo pipefail
MODE="${1:-update}"
BUDGET_FILE="${BUDGET_FILE:-./workspace/budget.json}"
command -v python3 >/dev/null 2>&1 || { echo "budget hook: python3 not found, skipping" >&2; exit 0; }
[ -f "$BUDGET_FILE" ] || { echo "budget hook: $BUDGET_FILE not found, skipping" >&2; exit 0; }
INPUT="$(cat 2>/dev/null || true)"

BUDGET_FILE="$BUDGET_FILE" MODE="$MODE" SLACK_BUDGET_WEBHOOK="${SLACK_BUDGET_WEBHOOK:-}" \
python3 - "$INPUT" << 'PY'
import json, os, sys, glob, urllib.request
bf = os.environ["BUDGET_FILE"]; mode = os.environ["MODE"]
inp = sys.argv[1] if len(sys.argv) > 1 else ""
b = json.load(open(bf))

def alert(msg):
    print("BUDGET:", msg)
    hook = os.environ.get("SLACK_BUDGET_WEBHOOK")
    if hook:
        try:
            urllib.request.urlopen(urllib.request.Request(hook,
                data=json.dumps({"text": ":moneybag: " + msg}).encode(),
                headers={"content-type": "application/json"}), timeout=5)
        except Exception: pass

if mode == "check":
    used = b.get("used_tokens", 0); cap = b.get("hard_cap_tokens", 0)
    if cap and used >= cap:
        sys.stderr.write(f"Token build budget exhausted ({used}/{cap}). A human must approve "
                         f"more tokens: raise allocated_tokens / hard_cap_tokens in {bf}.\n")
        sys.exit(2)
    sys.exit(0)

# update mode
try: ev = json.loads(inp) if inp.strip() else {}
except Exception: ev = {}
tp = ev.get("transcript_path", "")
if not tp or not os.path.exists(tp):
    sys.stderr.write("budget hook: no transcript_path, skipping\n"); sys.exit(0)

def toks(path):
    t = 0
    try:
        for line in open(path):
            try: u = (json.loads(line).get("message") or {}).get("usage") or {}
            except Exception: continue
            t += sum(u.get(k, 0) for k in ("input_tokens","output_tokens",
                     "cache_read_input_tokens","cache_creation_input_tokens"))
    except FileNotFoundError: pass
    return t

total = toks(tp)
for f in glob.glob(os.path.join(os.path.dirname(tp), "subagents", "agent-*.jsonl")):
    total += toks(f)
b["used_tokens"] = total
alloc = b.get("allocated_tokens", 0)
done = set(b.get("thresholds_alerted", []))
if alloc:
    pct = total * 100 // alloc
    for th in (25, 50, 75, 90):
        if pct >= th and th not in done:
            alert(f"build budget at {pct}% ({total}/{alloc} tokens) — crossed {th}% on {b.get('feature','?')}")
            done.add(th)
    if pct >= 100:
        alert(f"build budget EXCEEDED at {pct}% — new subagent dispatch will be blocked until a human raises it.")
    b["thresholds_alerted"] = sorted(done)
json.dump(b, open(bf, "w"), indent=2)
PY
