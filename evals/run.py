#!/usr/bin/env python3
"""Agent eval harness. Two kinds of case:

  deterministic — runs a shell command (exercises the real hooks/scripts) and
                  asserts exit code / stdout. Fully reproducible; runs in CI.
  llm           — invokes an actual agent and grades its output objectively
                  (did it find the planted bug, route correctly, refuse the
                  injection?). Non-deterministic, so each case runs N times and
                  passes on a pass-RATE threshold, compared to a baseline.

LLM cases need a runner; set EVAL_RUNNER=claude (uses `claude -p --agent <name>`)
or EVAL_RUNNER=api (Anthropic API, less faithful — tests the model, not the agent
config). With no runner, llm cases are SKIPPED so the deterministic suite still
gates CI. Zero third-party deps.

Usage: python3 evals/run.py [--only deterministic|llm]
Exit:  non-zero if any deterministic case fails, or any case regresses vs baseline.
"""
import json, os, subprocess, sys, statistics, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASES = json.load(open(os.path.join(ROOT, "evals", "cases.json")))
BASELINES = json.load(open(os.path.join(ROOT, "evals", "baselines.json")))
TOL = 0.10  # allowed pass-rate drop vs baseline before it's a regression
ONLY = None
if "--only" in sys.argv: ONLY = sys.argv[sys.argv.index("--only") + 1]

def grade(text, expect):
    t = (text or "").lower()
    ok = True
    for s in expect.get("contains_all", []):  ok &= s.lower() in t
    if "contains_any" in expect: ok &= any(s.lower() in t for s in expect["contains_any"])
    for s in expect.get("not_contains", []):   ok &= s.lower() not in t
    if "route_to" in expect: ok &= ("route to " + expect["route_to"].lower()) in t
    return ok

def invoke_agent(agent, prompt):
    runner = os.environ.get("EVAL_RUNNER", "none")
    if runner == "claude":
        p = subprocess.run(["claude", "-p", "--agent", agent, prompt],
                           capture_output=True, text=True, cwd=ROOT, timeout=600)
        return p.stdout
    if runner == "api":
        key = os.environ["ANTHROPIC_API_KEY"]
        body = json.dumps({"model": os.environ.get("EVAL_MODEL", "claude-sonnet-4-6"),
                           "max_tokens": 1500,
                           "messages": [{"role": "user", "content": prompt}]}).encode()
        req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body,
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        r = json.load(urllib.request.urlopen(req, timeout=600))
        return "".join(b.get("text", "") for b in r.get("content", []))
    return None  # no runner configured -> skip

def run_deterministic(c):
    p = subprocess.run(["bash","-c",c["command"]], capture_output=True, text=True, cwd=ROOT, timeout=120)
    exp = c["expect"]
    ok = (p.returncode == exp.get("exit", 0))
    if "stdout_contains" in exp: ok &= exp["stdout_contains"].lower() in (p.stdout + p.stderr).lower()
    return 1.0 if ok else 0.0

def run_llm(c):
    n = c.get("n_runs", 5); passes = 0; skipped = False
    for _ in range(n):
        out = invoke_agent(c["agent"], c["prompt"])
        if out is None: skipped = True; break
        passes += 1 if grade(out, c["expect"]) else 0
    if skipped: return None
    return passes / n

def main():
    rows, fails, regressions = [], 0, 0
    for c in CASES:
        if ONLY and c["kind"] != ONLY: continue
        rate = run_deterministic(c) if c["kind"] == "deterministic" else run_llm(c)
        base = BASELINES.get(c["id"])
        if rate is None:
            status = "SKIP (no runner)"
        else:
            thr = c.get("pass_threshold", 1.0)
            passed = rate >= thr
            regressed = base is not None and rate < base - TOL
            status = "PASS" if passed else "FAIL"
            if not passed and c["kind"] == "deterministic": fails += 1
            if regressed: status += " ⚠REGRESSION"; regressions += 1
        rows.append((c["id"], c["agent"], c["kind"], "-" if rate is None else f"{rate:.0%}",
                     "-" if base is None else f"{base:.0%}", status))
    w = max(len(r[0]) for r in rows) + 2
    print(f"{'case':<{w}}{'agent':<16}{'kind':<14}{'rate':<7}{'base':<7}status")
    for r in rows: print(f"{r[0]:<{w}}{r[1]:<16}{r[2]:<14}{r[3]:<7}{r[4]:<7}{r[5]}")
    print(f"\n{len(rows)} cases · {fails} deterministic failure(s) · {regressions} regression(s)")
    sys.exit(1 if (fails or regressions) else 0)

if __name__ == "__main__": main()
