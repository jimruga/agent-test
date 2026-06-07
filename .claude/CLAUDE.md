# Agent Development Team — Shared Protocol

This file is loaded into every agent's context (the PM main session and all
subagents). It is the single source of truth for stack, systems of record,
the shared workspace, ownership, human gates, budgets, and routing. Read it first.

> **Orchestration model:** The Product Manager runs as the **main session**
> (`claude --agent pm`). It is the only thread that can dispatch subagents.
> Subagents cannot call each other — every handoff goes back through the PM.

---

## Technology stack

- **Compute:** AWS EC2 for long-running, context-sensitive apps; AWS Lambda for
  short, on-demand, stateless work.
- **Cache:** Redis (ElastiCache) where a caching layer is justified.
- **APIs:** RESTful, secured with OAuth2. Prefer AWS-native services for tooling;
  use third-party OAuth providers when uptime/resilience requires it. Apply rate
  limiting and a WAF in front of public endpoints.
- **Frontend:** JavaScript + ReactJS.
- **Data:** AWS RDS (PostgreSQL) by default; DynamoDB (NoSQL) where access
  patterns justify it.
- **Infrastructure:** AWS CloudFormation. All infra is code — no console changes.
- **Production hardening:** intrusion prevention and DDoS protection (AWS WAF +
  Shield, rate limiting, least-privilege IAM, private subnets).

## Secrets & keys

- All secrets and keys live in the **AWS key store** — AWS Secrets Manager / SSM
  SecureString for secrets, AWS KMS for encryption keys.
- **Secrets and keys are NEVER checked into GitHub** — not in code, config, env
  files, CloudFormation parameters, fixtures, or history. Workloads read them at
  runtime via IAM roles. (See the `secrets-management` skill.)

## Systems of record (accessed via MCP connectors)

- **Slack** — all human communication and observability/alerting.
- **GitHub** — code, in separate component locations: `application`, `api`, `ux`,
  `tests`, `infrastructure`, and `migrations` (separate repos or top-level dirs).
- **Notion** — PRD, implementation plans, UX mocks, deployment plans, metrics
  plans, the deploy/rollback **runbook**, and documentation.
- **Jira** — feature tickets and bug tickets.
- **AWS** — infrastructure, deployments, monitoring, secrets/keys.

## Branch & change-control policy

Feature branch → Pull Request → **code-reviewer and security pass** → **human
approval (Gate 2)** → merge to main. No direct pushes to main. Migration scripts
are reviewed in the same PR as the code that depends on them.

## Shared workspace (local, version-controlled)

The systems above hold the canonical artifacts. The local `workspace/` is the
lightweight bus that lets a freshly-spawned subagent orient instantly:

- `workspace/STATE.md` — current phase, active feature, current owner,
  what it's blocked on, pending human gate, and budget status.
- `workspace/index.md` — canonical links (Notion, Jira, GitHub repos, dashboards).
- `workspace/handoff-log.md` — append-only handoffs, decisions, approvals.

**Every subagent starts with empty context. First action: read
`workspace/STATE.md` and `workspace/index.md`.** Last action: write your output
artifact and append a handoff line (see Routing).

## Ownership (final say within domain)

- **Software engineer** — maintainability and application architecture.
- **DevOps** — cost to run infrastructure, and **rollbacks + the runbook**.
- **Security** — security (application and infrastructure).
- **Data engineer** — **DB migrations** (authored to the `migrations` location).

Disputes inside an owner's domain are settled by that owner; anything outside a
single owner's domain goes to the PM. The **spend** agent monitors both budgets
read-only and routes findings to the relevant owner — it does not own spend
decisions.

## Budgets & cost controls

Two separate budgets, both estimated in the PRD and approved by a human at Gate 1.
Monitoring is handled by the **budget-threshold hook** (deterministic) and the
**spend** agent (analysis/forecast); decisions stay with the owners.

1. **Build budget (token usage).** The PM estimates token usage in the PRD and sets
   `allocated_tokens` + `hard_cap_tokens` in `workspace/budget.json`. The hook
   (`.claude/hooks/budget-threshold.sh`, wired in `.claude/settings.json`) updates
   `used_tokens` on every subagent/turn stop, posts a Slack alert when 25/50/75/90%
   is first crossed, and **blocks new subagent dispatch at the hard cap** until a
   human raises it. The spend agent forecasts overruns. **Only a human can approve
   additional token use.**
2. **Runtime budget (AWS infrastructure).** The DevOps engineer estimates the
   monthly run cost **for staging + production** in the PRD. A human approves the
   final estimated cost and any overage. The spend agent monitors actual AWS spend
   (per environment) vs the estimate and routes overage to DevOps and the human.

## Human-in-the-loop gates — HARD STOPS

At each gate the responsible agent posts a summary to Slack and **waits for
explicit human approval**, which the PM records in `handoff-log.md`. No agent
proceeds past its gate without that recorded approval.

1. **Requirements & PRD review** — before any design/build. Approving the PRD also
   approves the token build budget (1) and the AWS runtime cost estimate (2).
2. **Final code review approval** — after code-reviewer and security pass, before
   merge/deploy. Covers the code **and any DB migration in the same PR**.
3. **DevOps deployment plan review** — before executing any deployment.
4. **Metrics plan review** — before instrumenting any metrics.
5. **Acceptance sign-off** — the PM validates the shipped feature against the PRD
   acceptance criteria; a human signs off before the feature is closed.

Additional ad-hoc human approvals: token-budget overage, AWS runtime-cost overage.

## Routing / feedback loops

Subagents cannot call each other. Each agent ends its turn by writing its output
artifact and a single handoff line the PM acts on:

```
NEXT: route to <agent> — <reason> | gate: <none|human:gate-name>
```

Standard routes:

| Trigger | Route to | Notes |
|---|---|---|
| QA finds a defect | software-engineer | File a Jira bug first; link it |
| DevOps infra-cost concern | software-engineer | Architecture/cost tradeoff |
| Reviewer requests changes | software-engineer | Re-review after fix |
| Security finding (application) | software-engineer | Re-review after fix |
| Security finding (infrastructure) | devops | Re-review after fix |
| DB migration needed | data-engineer | Authored to `migrations`, reviewed with the PR |
| Token build budget forecast over | pm | Spend agent flags; human approves overage |
| AWS spend over/anomaly (infra) | devops | Spend agent flags; human approves overage |

## Conflict resolution

The PM resolves conflicts and logs the resolution in `handoff-log.md`. If the
**same** conflict recurs more than once, the PM escalates it to the human for
approval before continuing.

## Lifecycle (PM-driven)

1. Requirements → PRD with acceptance criteria + token estimate + AWS cost
   estimate (PM + designer + devops estimate) → **[Gate 1: PRD]**
2. UX design (designer) → mocks in Notion
3. Architecture (software-engineer) → impl plan/ADR in Notion; migrations planned
   by data-engineer; metrics plan (data-engineer) → **[Gate 4: metrics plan]**
4. Implementation (software-engineer + frontend-engineer), test-driven; migrations
   authored by data-engineer to `migrations`
5. Testing (qa-engineer) → defects route to software-engineer
6. Review (code-reviewer + security, code + migrations together) → findings route
   back → **[Gate 2: code approval]** → merge per branch policy
7. Deployment plan + runbook (devops) → **[Gate 3: deploy plan]** → staging →
   smoke test → prod; devops owns rollback
8. Observe & support (data-engineer metrics, support-writer docs + triage)
9. **[Gate 5: acceptance sign-off]** against PRD acceptance criteria → close
