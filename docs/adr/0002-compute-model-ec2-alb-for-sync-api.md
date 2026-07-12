# ADR-0002 — Compute model: EC2 + ALB for the synchronous API; Lambda for scheduled async work

- **Status:** Accepted (architecture phase, Team To-Do App MVP, 2026-07-09)
- **Deciders:** architect (ruling); input from devops-engineer (cost flag, PRD §9)
- **Scope:** Platform-setting. This is the first service; it establishes the
  default compute model for the Team To-Do App and services that follow.
- **Risk tier:** Regulated (PII + WCAG 2.2 AA + OAuth2). ADR-level decision → architect owns.
- **Supersedes/relates:** Implements the compute guidance in `.claude/CLAUDE.md`
  (EC2 for long-running context-sensitive apps; Lambda for short stateless work).

## Context

DevOps flagged (PRD §9) that a serverless **Lambda + API Gateway** API could roughly
**halve prod compute cost (~$120–150/mo)** versus the CLAUDE.md-default
**EC2 + ALB (~$210/mo prod)** — a cold-start / RDS-connection-pooling tradeoff to
decide at architecture, not in the PRD. A ruling is needed before the TDD (Gate 3)
so the software-engineer and devops-engineer build against one model.

Constraints that bear on the decision:

- **SLOs (PRD §7):** API availability ≥ 99.9%; **p95 task-list load < 500 ms**;
  reminder delivered within ±5 min. Error rate < 0.5%.
- **Runtime budget:** ~$365/mo combined (staging + prod) already **approved at Gate 1**.
  The default EC2 path (~$330 combined) is already inside that envelope.
- **Scale:** "low thousands of users" (PRD §11) — modest, spiky-but-low traffic. A
  low-traffic app means Lambda would frequently serve **cold** invocations.
- **Data access:** RDS PostgreSQL via Knex, which wants a **warm, bounded connection
  pool** — the classic Lambda pain point (one live execution ≈ one DB connection →
  connection exhaustion at concurrency).
- **App shape:** a long-running Hono/Fastify HTTP server (the `api-conventions.md`
  pattern exports a served `app` instance). This is the "long-running,
  context-sensitive" case the CLAUDE.md default names for EC2.
- **Regulated posture:** private subnets, WAF, least-privilege IAM required either way.
- **Precedent weight:** this is the platform's first service — the choice becomes the
  paved road, and a serverless fork here forces every later service to either follow
  Lambda or create a split-brain compute model.

## Options considered

### A. EC2 + ALB for the synchronous API (CLAUDE.md default) — CHOSEN
Long-running Node server behind an Application Load Balancer, autoscaling group,
Multi-AZ. Warm Knex pool to RDS. WAF on the ALB.

- **+** No cold starts → meets the p95 < 500 ms SLO with headroom, no provisioned-
  concurrency spend.
- **+** Warm, bounded Knex connection pool — no RDS connection-exhaustion problem,
  **no RDS Proxy dependency** on the hot path.
- **+** Matches the CLAUDE.md default and the `api-conventions.md` served-`app`
  pattern → coherent first service, one paved road.
- **+** Already inside the approved $365/mo budget.
- **−** Higher idle cost (~$60–90/mo more prod than Lambda) — you pay for warm capacity.
- **−** You own patching/scaling of instances (standard, well-understood ops).

### B. Lambda + API Gateway for the synchronous API — REJECTED for the hot path
- **+** ~$60–90/mo cheaper prod at this traffic; scales to zero.
- **−** **Cold starts** (Node + VPC ENI + TLS to DB) risk the p95 < 500 ms SLO on a
  low-traffic app that is cold much of the time. Fixing it with **provisioned
  concurrency erases most of the cost advantage** — you're back near EC2 cost but
  with more moving parts.
- **−** **RDS connection pooling:** requires **RDS Proxy** (~$15/mo/instance + added
  latency + another regulated component to secure/monitor) to avoid exhausting
  Postgres connections.
- **−** Requires adapting the served-`app` pattern to a Lambda handler
  (`aws-lambda` adapter) — diverges from `api-conventions.md`'s in-process
  `app.request()` test model and sets a serverless precedent for the whole platform.
- **−** Net: modest, partly-illusory savings bought with real cold-start SLO risk,
  a new hot-path dependency (RDS Proxy), and platform-wide incoherence.

### C. Fargate/ECS — NOT SELECTED (out of the flagged tradeoff)
Reasonable middle ground (no instance patching, no cold-start-to-zero if min tasks
≥ 1) but not the option DevOps costed, and it still isn't the CLAUDE.md default.
Revisit platform-wide later via its own ADR if instance ops become a burden — not
this feature's decision.

## Decision

1. **Synchronous request-path API → EC2 + ALB** (Option A, the CLAUDE.md default).
   Autoscaling group, Multi-AZ in prod, WAF on the ALB, private subnets, warm Knex
   pool to RDS. No RDS Proxy required for the hot path.
2. **Scheduled / deferred async work → Lambda (+ EventBridge) and/or the existing
   `eb-worker` (SQS → Postgres).** This is where DevOps's cost point is genuinely
   right and where the CLAUDE.md default already points ("short, on-demand,
   stateless work"). Specifically, the **in-app reminder scan** (find tasks due
   soon, write notification rows; delivery is pull-based per the Gate-2 no-realtime
   decision) is a short, stateless, scheduled job → EventBridge-triggered Lambda or
   the worker, **not** the request-path API.

So we **do** adopt serverless — for the async tail, not the synchronous API. This
respects the default, meets the SLOs, and puts each workload on the right tool.

## Rationale (the short version DevOps and the TDD follow)

- The ~$60–90/mo prod delta is **already inside the approved $365/mo budget**, and
  the cost levers DevOps already identified — NAT Gateway → VPC endpoints (~$74/mo)
  and off-hours staging shutdown (~50% of staging) — **recover more than the Lambda
  delta without changing the architecture or risking the p95 SLO.** Pursue those
  levers instead of trading them for cold-start risk.
- Provisioned concurrency (the only way Lambda reliably meets p95 < 500 ms on a
  cold-most-of-the-time app) neutralizes most of the cost advantage, so the tradeoff
  isn't the clean "half the cost" it appears to be.
- A warm connection pool on EC2 sidesteps the RDS-connection-exhaustion problem
  entirely and avoids adding RDS Proxy as a regulated hot-path dependency.
- As the platform's first service, coherence matters: one paved compute road, with
  serverless reserved for the async work it's actually best at.

## Consequences

- **DevOps** builds EC2 + ALB + ASG (Multi-AZ prod, single-AZ scaled-down staging),
  WAF on the ALB, private subnets, least-privilege IAM — CloudFormation, no console
  changes. Prioritizes the identified cost levers (VPC endpoints, staging off-hours)
  to stay under budget. Stands up EventBridge + Lambda (or `eb-worker`) for the
  reminder scan.
- **software-engineer** builds the API as a long-running served Hono/Fastify `app`
  (resolve the Hono-vs-Fastify contradiction first — see codebase-map backlog #1),
  with a bounded Knex pool. The reminder scanner is a separate stateless job, not a
  request-path endpoint.
- **Cost:** ~$210/mo prod compute target; combined stays within the approved
  $365/mo. Spend agent monitors actuals vs estimate.
- **SLO:** p95 < 500 ms is achievable without provisioned-concurrency spend.
- **Revisit trigger:** if steady-state traffic grows enough that idle EC2 cost
  dominates, or instance ops become a burden, open a new ADR to evaluate
  Fargate/ECS or a serverless hot path — platform-wide, not per-feature.
