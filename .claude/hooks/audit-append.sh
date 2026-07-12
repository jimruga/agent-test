#!/usr/bin/env bash
# Tamper-EVIDENT append-only audit trail (hash chain). Each record embeds the
# SHA-256 of the previous record, so altering or deleting any past entry breaks
# the chain and `--verify` detects it. This makes the local log tamper-evident;
# true immutability comes from shipping it to an append-only store outside the
# agents' write scope (see compliance/audit-trail.md).
#
#   audit-append.sh <actor> <event> <ref> <gate> <detail...>
#   audit-append.sh --verify
#
# Example (PM recording a human approval at Gate 2):
#   audit-append.sh "human:jim" GATE_APPROVED "PR#412@a1b2c3d" gate-2-code "all-green green; reviewer+security passed"
#
# Requires: python3 (JSON + SHA-256). Log: compliance/audit-log.jsonl
set -uo pipefail
LOG="${AUDIT_LOG:-compliance/audit-log.jsonl}"
mkdir -p "$(dirname "$LOG")"; : > /dev/null

if [ "${1:-}" = "--verify" ]; then
  python3 - "$LOG" << 'PY'
import sys, json, hashlib
log = sys.argv[1]
prev = "GENESIS"; n = 0
try: lines = open(log).read().splitlines()
except FileNotFoundError: print("audit: no log yet"); sys.exit(0)
for i, ln in enumerate(lines, 1):
    if not ln.strip(): continue
    r = json.loads(ln)
    body = {k: r[k] for k in ("seq","ts","actor","event","ref","gate","detail","prev_hash")}
    calc = hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",",":")).encode()).hexdigest()
    if r["prev_hash"] != prev:
        print(f"TAMPER at line {i}: prev_hash mismatch (chain broken)"); sys.exit(1)
    if r["hash"] != calc:
        print(f"TAMPER at line {i}: record hash mismatch (content altered)"); sys.exit(1)
    prev = r["hash"]; n += 1
print(f"audit: chain intact, {n} record(s)")
PY
  exit $?
fi

ACTOR="${1:?actor}"; EVENT="${2:?event}"; REF="${3:-}"; GATE="${4:-}"; shift 4 2>/dev/null || shift $#; DETAIL="${*:-}"
python3 - "$LOG" "$ACTOR" "$EVENT" "$REF" "$GATE" "$DETAIL" << 'PY'
import sys, json, hashlib, datetime
log, actor, event, ref, gate, detail = sys.argv[1:7]
prev = "GENESIS"; seq = 1
try:
    lines = [l for l in open(log).read().splitlines() if l.strip()]
    if lines:
        last = json.loads(lines[-1]); prev = last["hash"]; seq = last["seq"] + 1
except FileNotFoundError:
    pass
body = {"seq": seq,
        "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "actor": actor, "event": event, "ref": ref, "gate": gate,
        "detail": detail, "prev_hash": prev}
body["hash"] = hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",",":")).encode()).hexdigest()
# note: hash is computed over the body WITHOUT the hash field
h = hashlib.sha256(json.dumps({k:body[k] for k in ("seq","ts","actor","event","ref","gate","detail","prev_hash")}, sort_keys=True, separators=(",",":")).encode()).hexdigest()
body["hash"] = h
with open(log, "a") as f: f.write(json.dumps(body, separators=(",",":")) + "\n")
print(f"audit: recorded #{seq} {event} ({gate or 'no-gate'})")
PY
