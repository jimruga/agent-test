# End-to-end walkthrough — "Inbound Webhook Processor" (serverless) through all five gates

Companion to `walkthrough.md`, using the serverless PRD in `example-prd-2.md`. Same
gate structure, but it exercises a **different infra path** — Lambda + API Gateway +
DynamoDB + EventBridge, no EC2, no relational migration — so a few roles behave
differently. Watch those differences, flagged with ▶.

Start it with:
```
claude --agent pm
> Build "Inbound Webhook Processor" — serverless intake/normalize/fan-out. Epic DAT-950.
```

---

## Phase 0 — Requirements (PM)
PM writes the PRD to Notion; sets `allocated_tokens: 1_600_000`,
`hard_cap_tokens: 2_000_000`, and the serverless AWS estimate in `budget.json`.

**GATE 1 — PRD review.**
Slack: `:clipboard: PRD "Webhook Processor" ready. Build budget 1.6M tokens (cap 2.0M). AWS est $205/mo (staging $25 + prod $180, usage-driven). Approve?`
Log: `... | pm -> human | PRD + budgets | gate: human:gate-1-prd | APPROVED by Jim`

## Phase 1 — Design (product-designer)
Minimal internal events console only (read-only). Lighter than PRD #1.
`> NEXT: route to software-engineer — API contract for signed intake + read API + event schema | gate: none`

## Phase 2 — Architecture + data (software-engineer, data-engineer)
- software-engineer: HTTP API (API Gateway) → intake Lambda (HMAC verify), normalize Lambda, EventBridge fan-out; OAuth2 on the read API. ADR in Notion.
  ▶ **No EC2** — picks Lambda for all compute (short, on-demand). Redis not used.
  `> NEXT: route to data-engineer — DynamoDB table + GSI design for events + dedupe | gate: none`
- data-engineer: ▶ **No relational migration.** Instead owns the **DynamoDB table/GSI design** — PK `providerId`, SK `eventId`, dedupe via conditional write on the dedupe key, GSI for time-range-by-status. Documents capacity mode (on-demand). This design is still **reviewed in the same PR** as the code. Drafts the metrics plan (reliability, dedupe rate, latency).

**GATE 4 — metrics plan review.**
Slack: `:bar_chart: Metrics plan: % processed OK, dedupe rate, receipt→bus p95. Approve before instrumenting?`
Log: `... | data-engineer -> human | metrics plan | gate: human:gate-4-metrics | APPROVED by Jim`

## Phase 3 — Implementation (software-engineer + frontend-engineer)
- software-engineer: TDD on intake/verify/normalize/fan-out Lambdas; commits to `api`/`application`. Signing secret read from **Secrets Manager at runtime** (AC6).
- frontend-engineer: builds the small read-only console to mocks; commits to `ux`.

*Budget tripwire (hook), lower allocation so it trips sooner:*
Slack: `:moneybag: build budget at 51% (816,000/1,600,000 tokens) — crossed 50% on feature Webhook Processor`

## Phase 4 — Testing (qa-engineer)  ▶ different bug than PRD #1
QA tests concurrent duplicate deliveries and finds a **dedupe race** — two simultaneous identical webhooks both write (AC3 fails).
`> NEXT: route to software-engineer — Jira BUG-room: dedupe race under concurrent retries, repro attached | gate: none`
software-engineer fixes with a **DynamoDB conditional write** (`attribute_not_exists(dedupeKey)`), failing-test-first.
`> NEXT: route to qa-engineer — fixed, re-test concurrency | gate: none` → green →
`> NEXT: route to code-reviewer — passes QA | gate: none`

## Phase 5 — Review (code-reviewer, then security)  ▶ two findings, two owners
- code-reviewer reviews the Lambda code **and the DynamoDB table/GSI design together**: flags a missing GSI for the analyst's time-range query.
  `> NEXT: route to data-engineer — add status+timestamp GSI for console queries | gate: none` → data-engineer adds it → re-review clean.
- security review:
  - App finding: intake Lambda accepts requests before fully validating the HMAC timestamp (replay window).
    `> NEXT: route to software-engineer — APP security (High): enforce signature timestamp/replay check | gate: none`
  - Infra finding: public intake lacks throttling.
    `> NEXT: route to devops-engineer — INFRA security (High): add API Gateway throttling + WAF rate rule on /intake | gate: none`
  Both fixed, security re-reviews: clean.
  `> NEXT: route to pm — security review clean | gate: none`

**GATE 2 — final code + design approval.**
▶ The PR includes Lambda code + the DynamoDB table/GSI definition (in `infrastructure`/CloudFormation), reviewed together. On open, **CI runs the gitleaks secret-scan** (`.github/workflows/ci.yml`) and passes — no signing secret in the diff.
Slack: `:white_check_mark: Code + DynamoDB design passed review + security; CI secret-scan green. Merge?`
Log: `... | code-reviewer -> human | recommend approval | gate: human:gate-2-code | APPROVED by Jim`

## Phase 6 — Deployment (devops-engineer)
CloudFormation: API Gateway + Lambdas + DynamoDB (on-demand) + EventBridge + WAF + Shield. Deployment plan + rollback runbook to Notion. ▶ Cheaper, usage-scaled.

**GATE 3 — deployment plan review.**
Slack: `:rocket: Deploy plan: staging -> smoke -> prod, rollback runbook linked. Prod est $180/mo (scales with volume). Approve?`
Log: `... | devops-engineer -> human | deploy plan + runbook | gate: human:gate-3-deploy | APPROVED by Jim`
Deploy staging → smoke → prod; devops owns rollback.

## Phase 7 — Observe & support  ▶ serverless cost spike
- data-engineer turns on instrumentation; dashboards + alerts to Slack.
- support-writer publishes the integration doc; triages feedback to Jira.
- ▶ spend agent catches a **retry storm**: `AWS prod invocations 9x baseline in 1h; DynamoDB write cost trending +140% — likely a provider retry loop.`
  `> NEXT: route to devops-engineer — investigate intake retry storm, consider WAF rate tighten / DLQ | gate: none`
  `> NEXT: route to pm — projected AWS overage if sustained; may need human approval | gate: human:aws-cost-overage`

## Phase 8 — Acceptance
PM validates AC1–AC6 (signature rejected on bad sig, dedupe once, p95 < 2s, authz, no secrets in repo).

**GATE 5 — acceptance sign-off.**
Slack: `:checkered_flag: Webhook Processor meets AC1–AC6. Final build spend 1,512,000 tokens (95% of allocation). Sign off to close?`
Log: `... | pm -> human | acceptance vs AC1-6 | gate: human:gate-5-acceptance | APPROVED by Jim`

---

### What this run exercises that PRD #1 didn't
Lambda-only compute (no EC2) · DynamoDB + GSI design instead of a relational
migration · HMAC signature / replay security finding · API Gateway throttling ·
a usage-driven AWS cost spike caught by the spend agent · the CI secret-scan gate
firing on the PR.
