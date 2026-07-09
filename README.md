# Agent development team — setup

A PM-orchestrated team of Claude Code subagents. The Product Manager runs as the
main session and delegates to **fourteen specialists**. Shared context lives in
`.claude/CLAUDE.md` (loaded by every agent), shared skills in `.claude/skills/`,
budget enforcement in `.claude/hooks/` + `.claude/settings.json`, and live state
in `workspace/`.

## Layout

```
.claude/
  CLAUDE.md                 # shared protocol: stack, secrets, gates, budgets, routing
  settings.json             # wires the budget hook (PreToolUse/SubagentStop/Stop)
  hooks/
    budget-threshold.sh     # token tripwire: 25/50/75/90% Slack alerts + hard-cap block
    verify-gate.sh          # advisory local fast-verify on subagent stop
    audit-append.sh         # hash-chained tamper-evident audit trail (+ --verify)
  agents/                   # pm (main session) + 10 specialists
    pm.md  product-designer.md  software-engineer.md  frontend-engineer.md
    qa-engineer.md  devops-engineer.md  data-engineer.md  support-writer.md
    code-reviewer.md  security.md  spend.md      # last three are read-only
  skills/                   # 9 SHARED skills (preloaded via each agent's `skills:`)
workspace/
  STATE.md  index.md  handoff-log.md  budget.json
examples/
  example-prd.md            # worked PRD (Saved Search Alerts — EC2/RDS + migration)
  example-prd-2.md          # serverless PRD (Lambda/DynamoDB — different infra path)
  walkthrough.md            # PRD #1 through all five gates, end to end
  walkthrough-2.md          # PRD #2 (serverless) through all five gates
.github/workflows/
  ci.yml                    # secret-scan + verify + migration apply/rollback (all-green)
verify.sh                   # single source of truth for "verified" (local + CI)
SECURITY-POSTURE.md         # agent-fleet threat model + least-privilege + injection boundary
evals/                      # agent eval harness: cases.json, run.py, baselines.json, EVALS.md
reliability/                # slo-policy · incident-response · feature-flags · postmortem-template · flags-registry · disaster-recovery
workspace/codebase-map.md   # brownfield: architecture + conventions + tiered refactor backlog (architect)
governance/                 # risk-tiers · roi-loop
FLEET-OPS.md                # maintaining the fleet + honest OPEX economics
scripts/
  setup-branch-protection.sh # makes all-green + independent review binding
compliance/                 # control-matrix · segregation-of-duties · audit-trail · audit-log.jsonl
CODEOWNERS                  # human owner review on migrations/ infrastructure/ compliance/
.gitignore                  # secrets backstop: env files, keys, certs, creds
.pre-commit-config.yaml     # gitleaks secret-scan on every commit
.gitleaks.toml              # gitleaks rules + doc-placeholder allowlist
```

## Launch

```bash
chmod +x .claude/hooks/budget-threshold.sh        # once, after cloning
export SLACK_BUDGET_WEBHOOK="https://hooks.slack.com/services/..."  # optional, for hook alerts
claude --agent pm
```

The PM is the only thread that can dispatch subagents; all routing flows back
through it (subagents cannot call each other). The hooks and eval harness need `python3` (commonly present); no `jq` required.

## The fourteen specialists

product-designer · software-engineer · frontend-engineer · qa-engineer ·
devops-engineer · data-engineer · support-writer · **code-reviewer** (read-only
gate) · **security** (read-only gate) · **spend** (read-only cost monitor) ·
**compliance** (read-only audit/attestation) · **sre** (reliability & incident response) ·
**architect** (cross-feature coherence) · **analyst** (realized ROI, read-only).

## Skills: shared vs folded

Nine shared `SKILL.md` files in `.claude/skills/`, preloaded per agent:
accessibility-wcag, tdd-workflow, oauth2-patterns, postgres-data-modeling,
software-design-patterns, secrets-management, aws-security, ddos-protection,
test-data. Everything single-agent is folded into that agent's prompt.

## Connectors (MCP servers)

Referenced by name in frontmatter: `slack`, `github`, `jira` (already connected),
`Confluence`, `aws`. Connect them in Claude Code and keep names matching.

## Secrets & keys

All secrets/keys live in the **AWS key store** (Secrets Manager / KMS), fetched at
runtime via IAM roles. **Nothing sensitive is ever committed to GitHub.** A
secret-scanning backstop is included: `.gitleaks.toml` + `.pre-commit-config.yaml`
(run `pip install pre-commit && pre-commit install` once per clone — gitleaks then
blocks any commit containing a secret), and `.gitignore` excludes env files, keys,
certs, and AWS credentials. The same scan runs server-side in CI
(`.github/workflows/ci.yml`) so anyone who skipped `pre-commit install` is still
caught — note that gitleaks-action needs a free `GITLEAKS_LICENSE` for GitHub
organizations, or swap to the license-free CLI step shown in that file.

## Branch policy

Feature branch → PR → code-reviewer + security pass → human approval (Gate 2) →
merge. No direct pushes to main. DB migrations live in the `migrations` location
and are reviewed in the same PR as the dependent code.

## Verification (machine-checked, not self-reported)

Agents don't get to assert success. `verify.sh` (lint/typecheck/test/coverage +
an anti-tamper diff check) is the one definition of "verified," run identically
locally and in CI. CI also applies+rolls-back migrations on an ephemeral DB and
rolls everything into one `all-green` check. `scripts/setup-branch-protection.sh`
makes `all-green` plus an independent review *required* — so a red or self-approved
PR can't merge, no matter what an agent claims. Full rationale and setup in
`VERIFICATION.md`.

## Budgets

- **Build (tokens):** PM sets `allocated_tokens` + `hard_cap_tokens` in
  `workspace/budget.json` from the PRD. The **hook** auto-updates usage, posts
  Slack alerts at 25/50/75/90%, and **blocks dispatch at the hard cap**. The
  **spend** agent forecasts; only a human approves overage.
- **Runtime (AWS, staging + production):** devops estimates both environments in
  the PRD; you approve the total and any overage. The spend agent monitors actuals
  per environment.

## Agent security (least privilege + injection)

The fleet holds real capability and reads untrusted content (Jira, PRs, web pages,
webhook payloads), so it's an attack surface. Tools are scoped per agent (Bash and
Write/Edit removed where not needed); tool-sourced content is treated as **data,
not instructions** (injected directives are refused, quoted, and routed to a human);
`settings.json` permission rules deny reading secret files and shell exfiltration
and require approval on destructive AWS ops; CI scans dependencies (SCA) + emits an
SBOM. For code-executing agents the real blast-radius controls are operational —
sandboxed runtime, scoped IAM, and a network egress allowlist — and live in your
infra. Full model in `SECURITY-POSTURE.md`.

## Evals (is each agent actually good?)

Agents are unmeasured until tested, and drift when models/prompts change. `evals/`
is a harness with **deterministic** cases (run the real budget/verify/audit
controls and assert exit codes — these gate CI) and **LLM detection** cases (plant
a SQL injection / deleted test / missing authorization / prompt injection and check
the agent catches or refuses it, scored as a pass-rate over N runs vs a baseline).
`python3 evals/run.py` runs deterministic always and skips LLM unless `EVAL_RUNNER`
is set; the deterministic suite is verified green. Record your first real LLM run as
the baselines, then `evals.yml` flags regressions on agent/skill changes. Full model
and limits in `evals/EVALS.md`.

## Existing codebases (brownfield)

Bug fixes and refactors don't need a new agent. A **bug fix** is authorized by its Jira
ticket (no PRD): failing test first, fix, keep green; tiered Low/Standard. A **refactor**
is assessment-driven: the **architect** produces `workspace/codebase-map.md` (architecture,
real conventions, tech-debt hotspots, coverage gaps) and a tiered refactor backlog. The new
shared **legacy-refactoring** skill (engineer, architect, QA) enforces the safety net —
**characterization tests pin current behavior before any change**, small behavior-preserving
steps, strangler-fig behind a flag for big rewrites. On a new repo, bootstrap the conventions
`CLAUDE.md` with `/init` and have the architect map it first.

## Orchestration & economics

The PM runs a **portfolio**, not one feature at a time: `workspace/backlog.json` holds
priority order + a WIP limit, the PM dispatches independent agents in parallel, and on
restart it **resumes from STATE.md** rather than re-running. `loop-guard.sh` flags work
that bounces between the same agents and escalates to a human. **Risk-tiered gating**
(`governance/risk-tiers.md`) matches scrutiny to risk — trivial/low changes auto-merge
on green CI and skip the heavy agents + human gate; high/regulated add architect, deep
security, compliance, and dual authorization — which is also the main cost lever. The
**analyst** closes the ROI loop (`governance/roi-loop.md`): realized value vs build
tokens + run cost → keep/iterate/kill. `FLEET-OPS.md` covers maintaining the agents and
the honest question of whether the OPEX math actually closes.

## Reliability & incidents (#4)

Progressive delivery instead of all-or-nothing: ship dark behind a **feature flag**,
ramp (canary→1%→10%→50%→100%) watching SLIs, with a **kill switch** as the instant-off
lever and rollback as fallback. The **sre** agent owns SLOs/error budgets (exhausted
budget → recommend a feature-launch freeze) and is incident commander: classify,
**mitigate first** (kill-switch→rollback→hotfix), then a blameless postmortem feeding
the backlog and the eval suite. Incidents use an **emergency-change** path that's
human-authorized, audit-logged (`EMERGENCY_CHANGE`), and retroactively reviewed. See
`reliability/` and `examples/incident-walkthrough.md`.

## Compliance & segregation of duties

Not legal advice; this makes the team auditable, not certified. The agent fleet
is "the developer"; the independent controls are **human** — authorize (Gate 1),
approve the merge independent of the author (Gate 2), authorize the prod deploy
separately from merge (Gate 3, via a GitHub Environment reviewer), accept (Gate 5).
The **compliance** agent attests to evidence and never approves. Authorizations are
recorded in a **hash-chained, tamper-evident** audit trail (`compliance/audit-log.jsonl`
via `audit-append.sh`, verifiable with `--verify`) and externalized to a WORM store.
See `compliance/control-matrix.md`, `segregation-of-duties.md`, `audit-trail.md`,
and `CODEOWNERS`.

## Human gates (hard stops)

1. PRD review (also approves both budgets) · 2. Final code + migration approval ·
3. Deployment plan review · 4. Metrics plan review · 5. Acceptance sign-off.
Plus ad-hoc token-overage and AWS-cost-overage approvals.

## Watch it run

Read `examples/walkthrough.md` — it traces `example-prd.md` through all five gates,
both feedback loops (QA→engineer bug, security→devops finding), and a live budget
tripwire, with the Slack messages and handoff-log lines you'll see for real.
`examples/example-prd-2.md` is a second, deliberately serverless feature
(Lambda + API Gateway + DynamoDB + EventBridge, no EC2, no relational migration)
to exercise a different infra path and a much lower runtime cost. Its own
end-to-end trace is in `examples/walkthrough-2.md` — DynamoDB design instead of a
migration, an HMAC/replay security finding, and a usage-driven cost spike the spend
agent catches.
