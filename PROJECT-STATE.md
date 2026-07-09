# Agent Development Team — Project State

*Record of the current end state. Paste into Confluence (it imports Markdown, including the tables below).*

**What it is:** a PM-orchestrated team of Claude Code subagents that takes a feature from requirements through design, build, test, review, security, deploy, and support — with human approval at five gates and automated budget controls.

**Orchestration model:** the Product Manager runs as the **main session** (`claude --agent pm`) and is the only thread that can dispatch subagents. Subagents run in isolated context and **cannot call each other** — every handoff routes back through the PM. Agents coordinate through shared artifacts (a local `workspace/` ledger plus the systems of record), not direct messaging.

---

## Agents (15 total: PM + 14 specialists)

| Agent | Role | Owns | Input → Output | Model | Mode |
|---|---|---|---|---|---|
| **pm** | Product manager / orchestrator (main session) | Requirements, PRD, business outcomes, token build budget *decision*, conflict resolution, all gate enforcement | Feature request / Jira epic → approved PRD (with token + AWS estimates) + orchestrated delivery | opus | read/write |
| **product-designer** | UX/UI design | UX | Approved PRD → UX spec + mocks (Claude Design) | sonnet | read/write |
| **software-engineer** | Backend / full-stack | **Maintainability** + app architecture | PRD + UX + API contract + feedback → code (`application`/`api`) + ADR, tests-first | opus | read/write |
| **frontend-engineer** | ReactJS UI | — | UX spec + mocks + API contract → React code (`ux`) + component tests | sonnet | read/write |
| **qa-engineer** | Test automation | Test suite | Feature + acceptance criteria + test data → tests (`tests`), report, Jira bugs | sonnet | read/write |
| **devops-engineer** | AWS infra & network security | **Infra run cost**, **rollbacks + runbook** | Architecture + approved code → CloudFormation (`infrastructure`), deploy plan + rollback runbook (Confluence), monitoring; AWS cost estimate (staging+prod) | opus | read/write |
| **data-engineer** | Metrics, ROI, test data | **DB migrations** (`migrations`) | PRD + data model → migrations, metrics plan `docs\tdd`, instrumentation, fabricated datasets | sonnet | read/write |
| **support-writer** | Training & support | — | User feedback + shipped behavior → triaged Jira tickets + docs/training (Confluence) | sonnet | read/write |
| **code-reviewer** | Code review gate | — | PR (code **+ migration together**) → structured review; routes fixes | opus | **read-only** |
| **security** | App + infra security gate | **Security** | Code + migration + infra → severity-tagged findings; app→engineer, infra→devops | opus | **read-only** |
| **spend** | Cost monitor | — | `budget.json` + AWS Cost Explorer → spend report; routes overage to PM/devops | sonnet | **read-only** |
| **compliance** | Compliance & audit | — (attests, never approves) | Change + control matrix → evidence attestation + control/access reports; routes gaps to human | opus | **read-only** |
| **sre** | Reliability & incident response | Runtime reliability (SLOs/error budgets) | Alert/incident → mitigation routing + blameless postmortem; sets rollout guardrails | opus | read/write (no Bash) |
| **architect** | Cross-feature technical coherence | Architecture standards + ADR record | Design/proposal → coherence review (reuse vs reinvent), ADRs | opus | advisory (no Write) |
| **analyst** | Realized ROI | — (recommends) | Live metrics + costs → keep/iterate/kill recommendation | sonnet | **read-only** |

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
- **`workspace/index.md`** — canonical links to Confluence/Jira/GitHub/AWS/dashboards.
- **`workspace/handoff-log.md`** — append-only handoffs, decisions, approvals.
- **`workspace/budget.json`** — token allocation/usage + AWS estimate (maintained by the hook).
- **Slack** — human comms + observability/alerts. **GitHub** — code, in locations `application`, `api`, `ux`, `tests`, `infrastructure`, `migrations`. **Confluence** — runbook, docs. **Jira** — feature + bug tickets. **AWS** — infra, deploys, monitoring, secrets/keys. (Each is an MCP connector referenced by name in agent frontmatter.)

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
> TODO: align this
1. **Requirements & PRD review** — before any design/build. Approving the PRD also
   approves the token build budget (1) and the AWS runtime cost estimate (2).
2. **Design review** - after the PRD is approved, before the technical design document
   is written.
3. **Technical Design Document (Tdd) Review** - after the Design of UX is approved,
   before the Epics and Stories are built.
4. **Story Review** - before implementation, Approving the Epics/Stories to be
   created in Jira.
5. **Pull Request (PR) Acceptance** — after code-reviewer and security pass, before
   merge/deploy. Covers the code **and any DB migration in the same PR**. Requested
   only once the PR's `all-green` check is green; branch protection enforces no
   merge without it plus an independent approval.
6. **Infra Plan Review** — created by devops and needs to be approved before 
   executing any Deploy. "Deployed to staging" is proven by an automated 
   post-deploy health/smoke check, not an agent claim; a failed check auto-rolls-back.
7. **E2E Acceptance** - after the end to end (E2E) functional tests have been run 
   against staging and have all passed `all-green`.
8. **Metrics Review** — before instrumenting any metrics.
9. **User Acceptance sign-off** — the PM validates the shipped feature against the PRD
   acceptance criteria, backed by passing acceptance-tagged tests where possible;
   a human signs off before the feature is closed.

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

## Agent security (least privilege + injection defense)

The agent fleet is treated as an attack surface. Tools are scoped per agent (`disallowedTools` removes Bash from the designer, support-writer, and spend agents, and Write/Edit from all read-only agents); connectors were already least-privilege. All tool-sourced content (Jira tickets, PR bodies/diffs, web pages, file contents, tool output, webhook payloads) is handled as **data, not instructions** — injected directives to change scope, run commands, read secrets, alter the audit log, or bypass a gate are refused and routed to a human. `.claude/settings.json` adds permission deny rules (no reading secret files; no `curl`/`wget` exfiltration) and `ask` rules on destructive AWS/IAM/KMS/Secrets ops. CI gained an `sca` job (npm/pip audit failing on high/critical, plus SBOM), closing control #10. For the agents that must run code, the load-bearing controls are operational and live in infra: a **sandboxed runtime with no ambient prod credentials, scoped IAM roles, and a network egress allowlist**. The structural backstops from #1/#2 (human-only gate authorization, branch protection, hash-chained audit trail) limit the *impact* of any successful injection. See `SECURITY-POSTURE.md`. Honest limit: permission rules and the injection boundary raise the bar but are not airtight — IAM/sandbox/egress are the real containment.

## Evals (agent quality & regression)

An eval harness (`evals/`) measures whether each agent actually performs. **Deterministic** cases exercise the real controls (budget hook block/allow, audit hash-chain tamper/deletion detection, verify anti-tamper) and assert exit codes — these run green and gate CI. **LLM detection** cases plant a known defect and check the agent catches it: SQL injection / hardcoded secret / no-false-positive (security), deleted-test rejection (reviewer), missing authorization (compliance), bug routing (PM), and prompt-injection refusal (support-writer, data-engineer); each runs N times and passes on a pass-rate vs a baseline, flagging >10% drift as a regression. `evals.yml` runs deterministic on every push (blocking) and LLM on schedule / agent-skill changes (reporting). Record first-run rates as baselines. Limits in `evals/EVALS.md`: evals only catch what you wrote cases for; grow them from real incidents. (Also: the budget hook was moved from jq to python3, removing a dependency.)

## Existing codebases (brownfield: refactor & bug-fix)

No new agent is needed. **Bug fixes** are authorized by their Jira ticket (no PRD) — failing test first, fix, keep green, tiered Low/Standard. **Refactors** are assessment-driven: the **architect** (now able to author docs) produces `workspace/codebase-map.md` — architecture, real conventions, tech-debt hotspots ranked by risk x churn, coverage gaps, dependency/security debt — plus a prioritized, tiered refactor backlog, and it orients every fresh-context subagent. A new shared **legacy-refactoring** skill (software-engineer, architect, QA) enforces the safety net: **characterization (golden-master) tests pin current behavior before any change**, refactors are behavior-preserving in small `verify.sh`-green steps (behavior changes are a separate tested change), and large rewrites use a strangler-fig behind a feature flag. Skills now number 13 (shared). The brownfield entry path (ticket-or-assessment instead of PRD, risk-tiered) is wired into the PM and protocol; bootstrap a new repo's conventions with Claude Code `/init`.

## Orchestration, governance & economics

The PM runs a **portfolio**: `workspace/backlog.json` holds priority order and a WIP limit, independent agents can run in parallel, and the PM **resumes from STATE.md** on restart rather than re-running a feature (agents check before acting to avoid duplicate PRs/tickets). `loop-guard.sh` detects thrash — the same work bouncing between the same agents — and escalates to a human (tested; wired as a SubagentStop hook). **Risk-tiered gating** (`governance/risk-tiers.md`) matches scrutiny to risk: trivial/low changes auto-merge on green CI + review and skip the architect, analyst, deep security, compliance, and the human gate; standard runs the full lifecycle; high/regulated add architect + deep security + compliance + dual authorization. This is also the main cost lever — it decides which agents run. Two new roles: the **architect** owns coherence across features (standards + ADRs, reuse over reinvention), and the **analyst** closes the **ROI loop** (`governance/roi-loop.md`) — realized value vs build tokens + run cost → keep/iterate/kill, so low-ROI features get retired rather than accreting OPEX. `FLEET-OPS.md` is honest about the meta-cost (governance agents re-read context on every change; gates cost human time) and the levers (risk tiers, ROI loop, cheaper models for cheaper roles) — with the standing instruction to *measure* the saving, not assume it.

## Reliability & incident response

Progressive delivery replaces all-or-nothing deploys: changes ship dark behind a **feature flag**, ramp through canary/percentage stages watching SLIs, with a **kill switch** as the instant-off lever (rollback is the fallback). A new **sre** agent owns runtime reliability — SLOs and an **error-budget policy** that recommends a feature-launch freeze when the budget is exhausted — and acts as incident commander: classify severity, **mitigate first** (kill-switch → rollback → hotfix), coordinate (devops flips flags/rolls back; engineer hotfixes), then a **blameless postmortem** whose action items feed the backlog and the eval suite. Incidents use an **emergency-change** control that bypasses the normal gates but stays accountable: a human authorizes, it's recorded to the audit trail as `EMERGENCY_CHANGE`, and it gets a retroactive review + postmortem. Docs in `reliability/` (slo-policy, incident-response, feature-flags, postmortem-template, flags-registry); `examples/incident-walkthrough.md` traces a SEV2 mitigated by kill switch. This implements control #12; on-call paging rotation and backup/DR remain operational/org items.

## Compliance & segregation of duties

Not legal advice; the system is made auditable, your assessors certify it. The agent fleet is treated as "the developer"; the independent controls are **human and required** — authorize the change (Gate 1), approve the merge independent of the author (Gate 2), authorize the prod deploy separately from merge (Gate 3, via a GitHub Environment reviewer), accept (Gate 5). The **compliance** agent attests to evidence completeness and never approves (read-only). A **hash-chained, tamper-evident** audit trail (`compliance/audit-log.jsonl` via `audit-append.sh`, `--verify` detects any alteration/deletion) records authorizations and is externalized to a WORM store outside agent write scope. `compliance/control-matrix.md` maps controls to SOX ITGC / SOC 2 / PCI-DSS / ISO 27001 / NIST 800-53/171 with evidence and owners; `segregation-of-duties.md` and `audit-trail.md` document the model; `CODEOWNERS` enforces human review on sensitive paths. Known gaps (SCA/SBOM, formal incident response, backup/DR) are listed honestly in the matrix.

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
- **Skills are stubs of practice guidance**, not battle-tested; an eval harness now exists (`evals/`) — populate LLM baselines from real runs and grow cases from incidents.
- **Token estimates in the PRD** are the least reliable input (spend is driven by iteration count); seed the PM with real per-phase bands after the first few runs.
- **Remaining gaps:** replay/DLQ tooling, accessibility audit automation beyond the axe baseline, org-level GitHub push protection, and — most importantly — the controls whose reality depends on **your infrastructure and operations**, not these files: the sandboxed runtime + scoped IAM + egress allowlist (#3), the externalized WORM audit store (#2), a real on-call paging rotation (#4), and an actually-run DR restore drill (#13). The repo encodes the policy and machinery; those make it real.
