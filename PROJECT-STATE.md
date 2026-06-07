# Agent Development Team — Project State

*Record of the current end state. Paste into Notion (it imports Markdown, including the tables below).*

**What it is:** a PM-orchestrated team of Claude Code subagents that takes a feature from requirements through design, build, test, review, security, deploy, and support — with human approval at five gates and automated budget controls.

**Orchestration model:** the Product Manager runs as the **main session** (`claude --agent pm`) and is the only thread that can dispatch subagents. Subagents run in isolated context and **cannot call each other** — every handoff routes back through the PM. Agents coordinate through shared artifacts (a local `workspace/` ledger plus the systems of record), not direct messaging.

---

## Agents (11 total: PM + 10 specialists)

| Agent | Role | Owns | Input → Output | Model | Mode |
|---|---|---|---|---|---|
| **pm** | Product manager / orchestrator (main session) | Requirements, PRD, business outcomes, token build budget *decision*, conflict resolution, all gate enforcement | Feature request / Jira epic → approved PRD (with token + AWS estimates) + orchestrated delivery | opus | read/write |
| **product-designer** | UX/UI design | UX | Approved PRD → UX spec + mocks (Notion) | sonnet | read/write |
| **software-engineer** | Backend / full-stack | **Maintainability** + app architecture | PRD + UX + API contract + feedback → code (`application`/`api`) + ADR, tests-first | opus | read/write |
| **frontend-engineer** | ReactJS UI | — | UX spec + mocks + API contract → React code (`ux`) + component tests | sonnet | read/write |
| **qa-engineer** | Test automation | Test suite | Feature + acceptance criteria + test data → tests (`tests`), report, Jira bugs | sonnet | read/write |
| **devops-engineer** | AWS infra & network security | **Infra run cost**, **rollbacks + runbook** | Architecture + approved code → CloudFormation (`infrastructure`), deploy plan + rollback runbook (Notion), monitoring; AWS cost estimate (staging+prod) | opus | read/write |
| **data-engineer** | Metrics, ROI, test data | **DB migrations** (`migrations`) | PRD + data model → migrations, metrics plan (Notion), instrumentation, fabricated datasets | sonnet | read/write |
| **support-writer** | Training & support | — | User feedback + shipped behavior → triaged Jira tickets + docs/training (Notion) | sonnet | read/write |
| **code-reviewer** | Code review gate | — | PR (code **+ migration together**) → structured review; routes fixes | opus | **read-only** |
| **security** | App + infra security gate | **Security** | Code + migration + infra → severity-tagged findings; app→engineer, infra→devops | opus | **read-only** |
| **spend** | Cost monitor | — | `budget.json` + AWS Cost Explorer → spend report; routes overage to PM/devops | sonnet | **read-only** |

Read-only agents enforce this with `disallowedTools: Write, Edit`.

---

## Skills

**Nine shared skills** (real `SKILL.md` files in `.claude/skills/`, preloaded via each agent's `skills:` field):

| Skill | Used by |
|---|---|
| accessibility-wcag | product-designer, frontend-engineer |
| tdd-workflow | software-engineer, frontend-engineer |
| oauth2-patterns | software-engineer, frontend-engineer, security |
| postgres-data-modeling | software-engineer, data-engineer |
| software-design-patterns | software-engineer, code-reviewer |
| secrets-management | software-engineer, frontend-engineer, devops, security |
| aws-security | devops-engineer, security |
| ddos-protection | devops-engineer, security |
| test-data | qa-engineer, data-engineer |

**Single-agent skills are folded** into each agent's own prompt rather than separate files — e.g. UX design system + user-flow mapping (designer); REST + Redis (engineer); React architecture, pixel-perfect, responsive (frontend); unit/isolation/e2e (QA); CloudFormation, EC2/Lambda, monitoring, cost (devops); metrics, ROI, PII, DynamoDB/migration design (data); technical writing, triage, training (support); review standards + maintainability (reviewer); appsec/OWASP (security); cost monitoring (spend).

---

## Shared workspace & systems of record

- **`workspace/STATE.md`** — current phase, owner, blocked-on, pending gate, budget status.
- **`workspace/index.md`** — canonical links to Notion/Jira/GitHub/AWS/dashboards.
- **`workspace/handoff-log.md`** — append-only handoffs, decisions, approvals.
- **`workspace/budget.json`** — token allocation/usage + AWS estimate (maintained by the hook).
- **Slack** — human comms + observability/alerts. **GitHub** — code, in locations `application`, `api`, `ux`, `tests`, `infrastructure`, `migrations`. **Notion** — PRD, plans, mocks, runbook, docs. **Jira** — feature + bug tickets. **AWS** — infra, deploys, monitoring, secrets/keys. (Each is an MCP connector referenced by name in agent frontmatter.)

---

## Technology stack

Compute: AWS **EC2** (long-running/context-sensitive) or **Lambda** (short/on-demand). Cache: **Redis (ElastiCache)** as needed. APIs: **RESTful + OAuth2**, AWS-native or third-party OAuth by uptime/resilience need; rate limiting + WAF on public endpoints. Frontend: **JavaScript + ReactJS**. Data: **RDS PostgreSQL** default, **DynamoDB** where access patterns justify. Infra: **CloudFormation** (all infra as code). Prod hardening: WAF + Shield, rate limiting, least-privilege IAM, private subnets.

---

## Secrets & keys

All secrets/keys live in the **AWS key store** (Secrets Manager / KMS), fetched at runtime via IAM roles. **Never committed to GitHub.** Backstop: `.gitignore` (env files, keys, certs, creds), `.pre-commit-config.yaml` (gitleaks v8.24.2 blocks any commit containing a secret), `.gitleaks.toml` (rules + doc-placeholder allowlist), and `.github/workflows/ci.yml` (server-side gitleaks scan mirroring the local hook).

---

## Branch & change-control policy

Feature branch → PR → **code-reviewer + security pass** → **human approval (Gate 2)** → merge to main. No direct pushes to main. DB migrations live in `migrations` and are reviewed in the same PR as the dependent code.

---

## Budgets & cost controls

1. **Build budget (tokens).** PM estimates in the PRD and sets `allocated_tokens` + `hard_cap_tokens` in `budget.json`. The **budget-threshold hook** (`.claude/hooks/budget-threshold.sh`, wired in `.claude/settings.json`) auto-updates usage on every subagent/turn stop, posts a Slack alert at 25/50/75/90%, and **blocks new subagent dispatch at the hard cap** until a human raises it. The **spend** agent forecasts overruns. Only a human approves additional token use.
2. **Runtime budget (AWS, staging + production).** DevOps estimates monthly cost for both environments in the PRD; a human approves the total and any overage. The spend agent monitors actuals per environment.

---

## Human-in-the-loop gates (hard stops)

1. **PRD review** — before any design/build (also approves both budgets).
2. **Final code + migration approval** — after reviewer + security pass, before merge.
3. **Deployment plan review** — before any deploy.
4. **Metrics plan review** — before instrumenting.
5. **Acceptance sign-off** — validated against PRD acceptance criteria, before closing.

Plus ad-hoc human approvals for token-budget and AWS-cost overages.

---

## Routing / feedback loops

Each agent ends its turn with a `NEXT: route to <agent> — <reason> | gate: <…>` line the PM acts on.

| Trigger | Routes to |
|---|---|
| QA finds a defect | software-engineer |
| DevOps infra-cost concern | software-engineer |
| Reviewer requests changes | software-engineer |
| Security finding (application) | software-engineer |
| Security finding (infrastructure) | devops-engineer |
| DB migration / table design needed | data-engineer |
| Token build budget forecast over | pm (→ human) |
| AWS spend over / anomaly | devops-engineer (→ human) |

**Conflict resolution:** the PM decides and logs it; if the same conflict recurs more than once, it escalates to a human.

---

## CI

`.github/workflows/ci.yml` runs the gitleaks secret-scan on push + PR (org accounts need a free `GITLEAKS_LICENSE`, or use the license-free CLI step in the file). DevOps extends it with test/build/deploy jobs per the real stack.

---

## Worked examples

- `examples/example-prd.md` — "Saved Search Alerts" (EC2 + RDS + relational migration). `examples/walkthrough.md` traces it through all five gates, both feedback loops, and a budget tripwire.
- `examples/example-prd-2.md` — "Inbound Webhook Processor" (serverless: Lambda + API Gateway + DynamoDB + EventBridge, no EC2, no relational migration). `examples/walkthrough-2.md` traces it, including DynamoDB design review, an HMAC/replay finding, and a usage-driven cost spike caught by the spend agent.

---

## File tree

```
.claude/
  CLAUDE.md                  settings.json
  hooks/budget-threshold.sh
  agents/  pm · product-designer · software-engineer · frontend-engineer ·
           qa-engineer · devops-engineer · data-engineer · support-writer ·
           code-reviewer · security · spend
  skills/  accessibility-wcag · tdd-workflow · oauth2-patterns ·
           postgres-data-modeling · software-design-patterns ·
           secrets-management · aws-security · ddos-protection · test-data
workspace/  STATE.md · index.md · handoff-log.md · budget.json
examples/   example-prd.md · example-prd-2.md · walkthrough.md · walkthrough-2.md
.github/workflows/ci.yml
.gitignore · .pre-commit-config.yaml · .gitleaks.toml · README.md
```

---

## Known limitations / open items

- **Token metering is best-effort** — the hook sums transcript usage; field names can vary by Claude Code version, so calibrate with one `--debug` run before trusting percentages. The hard cap blocks the *next* dispatch, not an in-flight subagent.
- **Skills are stubs of practice guidance**, not battle-tested; refine with the skill-creator eval loop over time.
- **Token estimates in the PRD** are the least reliable input (spend is driven by iteration count); seed the PM with real per-phase bands after the first few runs.
- **No replay/DLQ tooling, accessibility audit automation beyond axe baseline, or org-level GitHub push protection yet** — candidate next steps.
