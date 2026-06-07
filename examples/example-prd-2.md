# PRD — Inbound Webhook Processor (serverless)

> Second example PRD. Deliberately serverless to exercise a **different infra
> path** than "Saved Search Alerts": Lambda + API Gateway + DynamoDB +
> EventBridge, **no EC2, no relational migration**. Numbers illustrative.

## 1. Summary
Receive webhooks from a third-party provider (e.g., a payments platform), verify
the signature, normalize the payload, store the event, and fan it out to internal
consumers. Expose a small read API + minimal internal console to inspect events.

## 2. Problem & target user
Internal services need a reliable, deduplicated, queryable record of third-party
events without each team integrating the provider directly. Target user: internal
service owners and an ops analyst inspecting event history.

## 3. User stories
- As the provider, I can POST events to a public endpoint that verifies my signature.
- As an internal consumer, I receive normalized events via an event bus.
- As an ops analyst, I can query/inspect recent events in a read-only console.
- As ops, duplicate deliveries are detected and ignored (providers retry).

## 4. Acceptance criteria (drive QA and Gate 5)
- AC1: Requests with an invalid/missing signature are rejected (401) and logged.
- AC2: Valid events are normalized and persisted with provider id + dedupe key.
- AC3: Duplicate deliveries (same dedupe key) are stored once; consumers notified once.
- AC4: Events are published to the internal bus within 2s p95 of receipt.
- AC5: Read API + console enforce authz (only authorized internal users) and match mocks.
- AC6: No secrets/keys in the repo; signing secret + any provider OAuth creds from the AWS key store.

## 5. Success metrics (data engineer instruments — Gate 4)
- Reliability: % of valid webhooks processed without error (target ≥ 99.9%).
- Dedupe rate: duplicates suppressed / total received (observed, for tuning).
- Latency: receipt→bus p95 (target < 2s).

## 6. Scope
In: signed intake endpoint, normalization, dedupe, DynamoDB store, EventBridge
fan-out, read API + minimal console. Out (v1): replay tooling, multi-provider
adapters beyond the first, long-term archival to S3/Glacier.

## 7. Architecture notes (contrast with PRD #1)
- **Compute:** Lambda only (intake, normalize, fan-out) — short, on-demand, stateless. No EC2.
- **API:** API Gateway (HTTP API) in front of Lambda; OAuth2 for the read API; HMAC signature verify on intake.
- **Data:** **DynamoDB** (NoSQL) — partition key = providerId, sort key = eventId; dedupe via conditional writes on the dedupe key; GSI for time-range queries by status. (No relational migration; the data engineer owns the **table/GSI design + any capacity/index change** instead, still reviewed in-PR.)
- **Eventing:** EventBridge bus for fan-out to internal consumers.
- **Edge/security:** WAF rate-based rule + API Gateway throttling on the public intake; Shield; signing secret in Secrets Manager.

## 8. Build budget (tokens) — approved at Gate 1
- allocated_tokens: **1,600,000**
- hard_cap_tokens: **2,000,000**
- Illustrative breakdown: Design 120k · Architecture + DynamoDB/GSI + API 350k ·
  Lambda impl (TDD) 500k · Minimal console 250k · QA + fixes 220k ·
  Review + security 110k · DevOps + deploy 40k · Data/metrics 10k.

## 9. Runtime budget (AWS, staging + production) — approved at Gate 1
DevOps estimate (illustrative, monthly; serverless is cheaper and usage-driven):
- **Staging:** ~$25 (API Gateway + Lambda low volume, DynamoDB on-demand, WAF dev, CloudWatch)
- **Production:** ~$180 (API Gateway + Lambda at volume, DynamoDB on-demand, EventBridge, WAF + Shield, CloudWatch)
- **approved_total:** **$205/mo**. Cost scales with webhook volume — spend agent watches per-environment actuals for spikes (a retry storm shows up as invocation + DynamoDB cost).

## 10. Risks
- Signature verification correctness (reject forgeries; accept valid retries).
- Dedupe under concurrent duplicate deliveries (use DynamoDB conditional writes).
- Public intake is a DDoS / abuse surface (WAF rate rules + throttling).
- Cost runaway from a provider retry storm (alarm on invocation spikes).

## 11. Open questions
- Per-provider signing scheme variations?
- Dead-letter handling + replay for failed normalizations (v2)?
