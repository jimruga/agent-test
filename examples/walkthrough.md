# End-to-end walkthrough — "Saved Search Alerts" through all five gates

How the feature in `example-prd.md` flows through the team. `>` lines are the
`NEXT:` handoff each agent ends with; **GATE** lines are hard stops where the PM
posts to Slack and waits for you. Sample `handoff-log.md` and Slack entries are
shown so you can recognize them when it runs for real.

You start it with:
```
claude --agent pm
> Build "Saved Search Alerts" — see the goal in Slack / Jira epic DAT-900.
```

---

## Phase 0 — Requirements (PM, main session)
PM writes the PRD to Notion, sets `allocated_tokens: 2_400_000`,
`hard_cap_tokens: 3_000_000` and the AWS staging+prod estimate in
`workspace/budget.json`, asks DevOps for the cost estimate.

**GATE 1 — PRD review.**
Slack: `:clipboard: PRD "Saved Search Alerts" ready. Build budget 2.4M tokens (cap 3.0M). AWS est $660/mo (staging $140 + prod $520). Approve?`
Log: `... | pm -> human | PRD + budgets ready | gate: human:gate-1-prd | APPROVED by Jim`

## Phase 1 — Design (product-designer)
Reads PRD; produces flows + mocks + component inventory in Notion (WCAG AA in spec).
`> NEXT: route to software-engineer — API/data contract needed for save/list/delete + scheduled check | gate: none`
(PM also routes the mocks to frontend later.)

## Phase 2 — Architecture + data (software-engineer, data-engineer)
- software-engineer: API contract (OAuth2-protected REST), data model, ADR in Notion. Picks Lambda for the scheduled match-check, EC2 for the app API. Redis for hot saved-search reads.
  `> NEXT: route to data-engineer — schema needs saved_searches + alert_log tables; migration please | gate: none`
- data-engineer: authors the migration to the `migrations` location (forward + rollback); drafts the metrics plan (AC5 metrics) in Notion.

**GATE 4 — metrics plan review.**
Slack: `:bar_chart: Metrics plan ready: activation, CTR, return-visit ROI. Approve before instrumenting?`
Log: `... | data-engineer -> human | metrics plan | gate: human:gate-4-metrics | APPROVED by Jim`

## Phase 3 — Implementation (software-engineer + frontend-engineer)
- software-engineer: TDD on API + scheduled job; commits to `api`/`application`.
- frontend-engineer: builds React UI to mocks, OAuth2 PKCE, no secrets in bundle; commits to `ux`.

*Budget tripwire fires here automatically:*
Slack (from hook): `:moneybag: build budget at 52% (1,248,000/2,400,000 tokens) — crossed 50% on feature Saved Search Alerts`
Spend agent (on PM's check): `Token burn on track to finish ~88% of allocation. AWS staging MTD $96 vs $140 est — fine.`

## Phase 4 — Testing (qa-engineer)  ← feedback loop example
QA writes unit/isolation/UI tests using fabricated data from data-engineer. Finds a bug: instant alerts double-send on job retry (AC3).
`> NEXT: route to software-engineer — Jira BUG-911: duplicate alerts on retry, repro attached | gate: none`
software-engineer adds an idempotency key + failing-test-first fix.
`> NEXT: route to qa-engineer — BUG-911 fixed, re-test | gate: none`
QA re-runs: green.
`> NEXT: route to code-reviewer — feature passes QA | gate: none`

## Phase 5 — Review (code-reviewer, then security)  ← second feedback loop
- code-reviewer reviews code **and the migration together**: clean.
- security reviews app + migration + infra. Finds the alert-preferences endpoint lacks rate limiting (DDoS).
  `> NEXT: route to devops-engineer — INFRA security finding (High): no WAF rate rule on /preferences | gate: none`
  devops adds a WAF rate-based rule; security re-reviews: clean.
  `> NEXT: route to pm — security review clean | gate: none`

**GATE 2 — final code + migration approval.**
Slack: `:white_check_mark: Code + migration for Saved Search Alerts passed review + security. Merge to main?`
Log: `... | code-reviewer -> human | recommend approval | gate: human:gate-2-code | APPROVED by Jim` → merge per branch policy.

## Phase 6 — Deployment (devops-engineer)
Authors/extends CloudFormation; writes deployment plan + rollback runbook to Notion with the staging+prod cost.

**GATE 3 — deployment plan review.**
Slack: `:rocket: Deploy plan ready: staging -> smoke -> prod, rollback runbook linked. Prod est $520/mo. Approve?`
Log: `... | devops-engineer -> human | deploy plan + runbook | gate: human:gate-3-deploy | APPROVED by Jim`
Then: deploy staging → smoke test → production. devops owns rollback if needed.

## Phase 7 — Observe & support
- data-engineer turns on the approved instrumentation; dashboards + alerts to Slack.
- support-writer publishes the how-to doc in Notion and triages incoming feedback into Jira.
- spend agent: `AWS prod MTD $61 (partial month), trending ~$498/mo vs $520 est — within budget.`

## Phase 8 — Acceptance
PM validates against AC1–AC6.

**GATE 5 — acceptance sign-off.**
Slack: `:checkered_flag: Saved Search Alerts meets AC1–AC6. Final build spend 2,180,000 tokens (91% of allocation). Sign off to close?`
Log: `... | pm -> human | acceptance vs AC1-6 | gate: human:gate-5-acceptance | APPROVED by Jim` → feature closed.

---

### If the hard cap is hit
If build spend reaches `hard_cap_tokens`, the PreToolUse hook blocks the next
subagent dispatch and the PM tells you: *"Token build budget exhausted
(3,000,000). A human must approve more tokens: raise allocated_tokens /
hard_cap_tokens in workspace/budget.json."* Nothing proceeds until you do.
