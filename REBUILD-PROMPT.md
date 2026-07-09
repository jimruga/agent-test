# Rebuild Prompt — PM-Orchestrated Agent Software Team

Paste the block below to Claude (Claude Code recommended) to regenerate this entire scaffold from scratch. It captures every decision in one self-contained spec. **To adapt it for a different team**, change the stack, connectors, ownership, and budgets in sections 2, 7–11; the structure (orchestration model, gates, routing, skill split, budget hook) is reusable as-is.

---

> Build a multi-agent software development team as **Claude Code subagents**, written as files I can drop into a repo. Follow this spec exactly.
>
> **1. Orchestration model.** A Product Manager runs as the **main session** (`claude --agent pm`) and is the only thread that dispatches subagents (subagents can't call each other). Agents coordinate through shared on-disk artifacts, not direct messaging. Put shared context every agent needs in `.claude/CLAUDE.md`; put orchestration logic in the PM agent.
>
> **2. Stack** (bake into CLAUDE.md and the relevant agents): AWS EC2 for long-running/context-sensitive apps, Lambda for short on-demand work; Redis (ElastiCache) caching as needed; RESTful APIs with OAuth2 (AWS-native or third-party OAuth by uptime need); ReactJS frontend (JavaScript); RDS PostgreSQL default, DynamoDB where access patterns justify; CloudFormation for all infra; production hardened against intrusion and DDoS (WAF + Shield, rate limiting, least-privilege IAM, private subnets).
>
> **3. Agents** — create `.claude/agents/<name>.md` with YAML frontmatter (`name`, `description` written as a routing rule with trigger conditions, `model`, `mcpServers`, `skills`, `memory: project`, and `disallowedTools: Write, Edit` for read-only agents) and a body covering role, input artifact, output artifact, workflow, ownership, and a `NEXT: route to <agent> — <reason> | gate: <none|human:gate>` handoff line. Create these eleven:
> 1. **pm** (main session, opus) — gathers requirements, owns the PRD + business outcomes + token build-budget decision + conflict resolution, enforces all gates, dispatches everyone. Connectors: slack, jira, Confluence.
> 2. **product-designer** (sonnet) — UX spec + UI mocks to Confluence from the approved PRD; owns UX. Connectors: Confluence, slack.
> 3. **software-engineer** (opus) — implements app logic, APIs, data access via TDD; **owns maintainability + app architecture**; receives all defect/review/app-security/infra-cost feedback. Connectors: github, jira, Confluence, slack.
> 4. **frontend-engineer** (sonnet) — builds the ReactJS UI pixel-perfect to mocks, responsive/cross-browser, OAuth2 client (PKCE, no secrets in bundle). Connectors: github, jira, Confluence, slack.
> 5. **qa-engineer** (sonnet) — automates unit/isolation/UI tests, files Jira bugs, routes them to the engineer; owns the test suite, not fixes. Connectors: github, jira, slack.
> 6. **devops-engineer** (opus) — CloudFormation infra, staging+prod deploys, monitoring/alerting to Slack; **owns infra run cost and rollbacks + a runbook in Confluence**; estimates monthly AWS cost (staging + production) for the PRD. Connectors: aws, github, slack, jira.
> 7. **data-engineer** (sonnet) — instruments business/usage/ROI metrics, fabricates safe test data, and **owns DB migrations** (checked into a `migrations` location, reviewed in the same PR as the code). Connectors: aws, github, Confluence, slack.
> 8. **support-writer** (sonnet) — triages user feedback into Jira (bug vs enhancement) and writes docs/training to Confluence. Connectors: jira, Confluence, slack.
> 9. **code-reviewer** (opus, read-only) — reviews code **and any migration together** for quality/maintainability/coverage/secrets; routes fixes to the owner; recommends approval to trigger the human gate. Connectors: github, jira, slack.
> 10. **security** (opus, read-only) — **owns security**; reviews app + migration + infra; routes app findings to the engineer and infra findings to devops. Connectors: github, aws, jira, slack.
> 11. **spend** (sonnet, read-only) — monitors the token budget (from `workspace/budget.json`) and AWS actual spend per environment, forecasts overruns, routes token overage to the PM and AWS overage to devops; never decides or modifies. Connectors: aws, slack, jira.
>
> **4. Skills.** Create the skills that two or more agents share as real `.claude/skills/<name>/SKILL.md` files (frontmatter `name` + `description`, then guidance), and preload them via each agent's `skills:` field. Fold single-agent skills directly into that agent's prompt instead of separate files. The shared set is: **accessibility-wcag** (designer, frontend), **tdd-workflow** (engineer, frontend), **oauth2-patterns** (engineer, frontend, security), **postgres-data-modeling** (engineer, data), **software-design-patterns** (engineer, reviewer), **secrets-management** (engineer, frontend, devops, security), **aws-security** (devops, security), **ddos-protection** (devops, security), **test-data** (qa, data). Write real, substantive guidance in each.
>
> **5. Shared workspace.** Create `workspace/STATE.md` (phase, owner, blocked-on, pending gate, budget status), `workspace/index.md` (canonical links to the systems below), `workspace/handoff-log.md` (append-only handoffs/decisions/approvals), and `workspace/budget.json` (token allocation/usage + AWS estimate). Instruct every subagent to read STATE.md + index.md first (they start with empty context).
>
> **6. Systems of record** (MCP connectors, referenced by name): Slack (human comms + observability), GitHub (code in locations `application`, `api`, `ux`, `tests`, `infrastructure`, `migrations`), Confluence (PRD, plans, mocks, runbook, docs), Jira (feature + bug tickets), AWS (infra, deploys, monitoring, secrets).
>
> **7. Secrets.** All secrets/keys live in the AWS key store (Secrets Manager / KMS), fetched at runtime via IAM roles, **never committed to GitHub**. Add `.gitignore` (env files, keys, certs, creds, build artifacts), `.pre-commit-config.yaml` (gitleaks, pinned to a current version), `.gitleaks.toml` (extend default rules + allowlist doc placeholders), and `.github/workflows/ci.yml` (server-side gitleaks scan on push + PR, mirroring the local hook).
>
> **8. Branch policy.** Feature branch → PR → code-reviewer + security pass → human approval (Gate 2) → merge. No direct pushes to main. Migrations reviewed in the same PR as dependent code.
>
> **9. Budgets + enforcement.** Two budgets, both estimated in the PRD and approved at Gate 1. (a) **Build (tokens):** PM sets `allocated_tokens` + `hard_cap_tokens` in `budget.json`. Create `.claude/hooks/budget-threshold.sh` and wire it in `.claude/settings.json` so that on `SubagentStop`/`Stop` it recomputes total token usage from the session transcripts, writes `used_tokens`, and posts a Slack alert the first time 25/50/75/90% is crossed; and on `PreToolUse` matching the `Agent` tool it blocks dispatch (exit 2) once usage reaches the hard cap. It must fail open if `jq` or the budget file is missing, and only post to Slack if `SLACK_BUDGET_WEBHOOK` is set. Only a human approves overage. (b) **Runtime (AWS):** devops estimates monthly cost for **staging + production**; a human approves the total and overage; the spend agent monitors actuals.
>
> **10. Human gates (hard stops** — responsible agent posts to Slack and waits; PM records approval in handoff-log.md): (1) PRD review, (2) final code + migration approval, (3) deployment plan review, (4) metrics plan review, (5) acceptance sign-off against PRD criteria. Plus ad-hoc token-overage and AWS-cost-overage approvals.
>
> **11. Routing / feedback loops** (PM executes; agents emit a `NEXT:` line): QA defect → engineer; infra-cost concern → engineer; reviewer changes → engineer; security app finding → engineer; security infra finding → devops; migration/table design → data; token overage → PM→human; AWS overage → devops→human. **Conflict resolution:** PM decides and logs; if the same conflict recurs more than once, escalate to a human.
>
> **12. Lifecycle** (PM-driven): requirements→PRD (+token & AWS estimates) [Gate 1] → UX design → architecture + migration + metrics plan [Gate 4] → implementation (TDD) → testing → review + security (code + migration together) [Gate 2] → deploy plan + runbook [Gate 3] → staging→smoke→prod (devops owns rollback) → observe + support → acceptance [Gate 5].
>
> **13. Examples + README.** Add a README (layout, launch with `claude --agent pm`, connectors, skills, secrets, branch policy, budgets, gates), plus two worked PRDs and end-to-end walkthroughs through all five gates — one EC2/RDS feature with a relational migration, and one serverless feature (Lambda + API Gateway + DynamoDB, no relational migration) — each showing the gates, the feedback loops, and a budget event.
>
> Verify the budget hook logic before finishing. Output everything as files.


---

## Hardening appendix (v2 — production-grade additions)

The 13-point prompt above rebuilds the base team. To reproduce the hardened current state, also ask for:

- **Verification you can't fake (#1):** a single `verify.sh` (lint/typecheck/test/coverage + an anti-tamper diff check that rejects added `.only`/`.skip`/deleted tests), run in CI, with an `all-green` required status check and `scripts/setup-branch-protection.sh` (required check + independent review via `require_last_push_approval`).
- **Compliance + segregation of duties (#2):** agents make, humans authorize (gates 1/2/3/5); a read-only **compliance** agent that attests but never approves; a **hash-chained, tamper-evident audit trail** (`audit-append.sh`, `--verify`) externalized to a WORM store; a control matrix mapping to SOX/SOC2/PCI/ISO/NIST; `CODEOWNERS`.
- **Agent-fleet security (#3):** least-privilege per agent (`disallowedTools`), an untrusted-content/injection boundary (tool-sourced content is data, not instructions), `permissions` deny/ask rules, supply-chain SCA/SBOM in CI; sandbox + scoped IAM + egress allowlist as operational controls.
- **Evals:** a harness (`evals/run.py`) with deterministic control tests (gate CI) and LLM detection cases (planted vuln/bug/injection, pass-rate vs baseline, regression-flagged).
- **Reliability (#4):** feature flags + progressive delivery + kill switch; an **sre** agent owning SLOs/error budgets and incident command (mitigate-first); blameless postmortems; an **emergency-change** control (human-authorized, audit-logged, retroactively reviewed); DR.
- **Orchestration & economics:** a portfolio backlog with a WIP limit, parallel dispatch, resume-from-state, a thrash `loop-guard`; **risk-tiered gating** so cheap changes skip the heavy machinery; an **architect** (coherence) and **analyst** (ROI keep/iterate/kill) role; and a FLEET-OPS discipline that measures whether the OPEX actually drops.

Net: 15 agents, ~11 skills, hooks for budget/verify/audit/loop-guard, CI + branch protection, and a compliance/security/reliability/governance doc set. Build it as files; verify the hook and verify logic before finishing.
