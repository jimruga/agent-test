# Evals — measuring whether the agents are actually any good

Agents are unmeasured until you test them, and their behavior drifts every time a
model or prompt changes. This harness makes agent quality a number you can watch.

## Two kinds of case (`evals/cases.json`)

- **deterministic** — runs a shell command that exercises the real control
  (budget hook, verify tamper check, audit chain) and asserts the exit code. Fully
  reproducible; **must always pass**; gates CI. Example: plant a `.only` in a diff
  and assert `verify.sh` exits non-zero.
- **llm** — invokes an actual agent and grades its output **objectively**: did it
  find the planted SQL injection, route a bug to the software-engineer, refuse an
  injected instruction, flag the missing authorization? Because models are
  non-deterministic, each case runs N times and passes on a **pass-rate** threshold.

Detection evals (plant a known defect, check it's caught) are the high-signal core.
LLM-as-judge for open-ended quality is supported but is a softer, fallible signal —
prefer objective graders.

## Running

    python3 evals/run.py                 # deterministic always; llm skipped unless a runner is set
    EVAL_RUNNER=claude python3 evals/run.py   # invokes `claude -p --agent <name>` (faithful)
    EVAL_RUNNER=api ANTHROPIC_API_KEY=... python3 evals/run.py   # raw API (tests the model, not the agent config)
    python3 evals/run.py --only deterministic

Exit is non-zero on any deterministic failure or any **regression** (a pass-rate
that dropped more than 10% below `evals/baselines.json`).

## Baselines & regression

`baselines.json` holds the expected pass-rate per case. Deterministic = 1.0. LLM
baselines are placeholders — **run once against your real agents, record the
observed rates as the baselines, then the harness flags drift** when you change a
prompt, add a skill, or a new model ships. Run it in CI on changes to
`.claude/agents/**` / `.claude/skills/**`, and on a schedule.

## Coverage today
Deterministic: budget block/allow, audit chain (intact/tamper/deletion), verify
anti-tamper (rejects/clean). LLM: security (SQLi, hardcoded secret, no-false-positive),
reviewer (rejects deleted test), compliance (missing authorization), PM routing,
and injection refusal (support-writer, data-engineer). Add cases as you find gaps —
every real incident should become a new case.

## Honest limits
- Evals measure **what you wrote cases for**. They don't catch unknown unknowns;
  grow the suite from real misses and incidents.
- LLM cases cost tokens and are flaky by nature — that's why they're rate-based and
  why they don't hard-gate by default. Treat a drop as a signal to investigate, not
  proof of breakage.
- Objective graders can be fooled (an agent could mention "SQL injection" while
  missing the real issue). High coverage of cases is necessary, not sufficient —
  pair with periodic human review of agent output, like any other test suite.
- For skill-level benchmarking with variance analysis, see the `skill-creator` skill.
