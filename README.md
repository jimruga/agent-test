# Agent development team — setup

A PM-orchestrated team of Claude Code subagents. The Product Manager runs as the
main session and delegates to **ten specialists**. Shared context lives in
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
  ci.yml                    # server-side gitleaks secret-scan gate (devops extends it)
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
through it (subagents cannot call each other). The hook needs `jq` installed.

## The ten specialists

product-designer · software-engineer · frontend-engineer · qa-engineer ·
devops-engineer · data-engineer · support-writer · **code-reviewer** (read-only
gate) · **security** (read-only gate) · **spend** (read-only cost monitor).

## Skills: shared vs folded

Nine shared `SKILL.md` files in `.claude/skills/`, preloaded per agent:
accessibility-wcag, tdd-workflow, oauth2-patterns, postgres-data-modeling,
software-design-patterns, secrets-management, aws-security, ddos-protection,
test-data. Everything single-agent is folded into that agent's prompt.

## Connectors (MCP servers)

Referenced by name in frontmatter: `slack`, `github`, `jira` (already connected),
`notion`, `aws`. Connect them in Claude Code and keep names matching.

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

## Budgets

- **Build (tokens):** PM sets `allocated_tokens` + `hard_cap_tokens` in
  `workspace/budget.json` from the PRD. The **hook** auto-updates usage, posts
  Slack alerts at 25/50/75/90%, and **blocks dispatch at the hard cap**. The
  **spend** agent forecasts; only a human approves overage.
- **Runtime (AWS, staging + production):** devops estimates both environments in
  the PRD; you approve the total and any overage. The spend agent monitors actuals
  per environment.

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
