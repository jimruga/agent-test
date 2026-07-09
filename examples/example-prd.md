# PRD — Saved Search Alerts

> Example PRD (lives in Confluence in real use). The PM authors this; approving it at
> **Gate 1** also approves both budgets below. Numbers are illustrative — replace
> with your own from the first few runs.

## 1. Summary
Let a signed-in user save a search and be notified (email + in-app) when new
results match it. A scheduled job re-runs saved searches and dispatches alerts.

## 2. Problem & target user
Returning power users repeat the same searches to catch new items and miss
time-sensitive matches. Target user: an authenticated returning user who searches
at least weekly.

## 3. User stories
- As a user, I can save my current search with a name.
- As a user, I can choose alert frequency (instant, daily digest, off).
- As a user, I get an email and an in-app notification when new results match.
- As a user, I can view and delete my saved searches.

## 4. Acceptance criteria (testable — drive QA and Gate 5)
- AC1: A saved search persists with name, query params, frequency, and owner.
- AC2: Only the owner can read/modify/delete their saved searches (authz enforced server-side).
- AC3: The scheduled job detects new matches since the last run with no duplicate alerts.
- AC4: Email + in-app notification are delivered within 5 min for "instant".
- AC5: UI matches the approved mocks at mobile + desktop breakpoints and passes the axe-core baseline.
- AC6: No secrets/keys in the repo; all from the AWS key store.

## 5. Success metrics (data engineer instruments — Gate 4)
- Activation: % of weekly searchers who create ≥1 saved search (target 15% in 30 days).
- Engagement: alert click-through rate (target ≥ 20%).
- ROI proxy: return-visit rate of alert recipients vs control.

## 6. Scope
In: save/list/delete searches, frequency setting, scheduled match check, email +
in-app delivery. Out (v1): SMS/push, shared searches, ML ranking of matches.

## 7. Build budget (tokens) — approved at Gate 1
- allocated_tokens: **2,400,000**
- hard_cap_tokens: **3,000,000** (dispatch blocks here until a human raises it)
- Illustrative phase breakdown:
  - Design: 200k · Architecture + API/data + migration: 500k · Backend impl (TDD): 650k
  - Frontend impl: 500k · QA + fixes: 300k · Review + security: 150k
  - DevOps + deploy: 80k · Data/metrics: 20k
- The budget-threshold hook reports at 25/50/75/90%; the spend agent forecasts.

## 8. Runtime budget (AWS, staging + production) — approved at Gate 1
DevOps estimate (illustrative, monthly):
- **Staging:** ~$140 (small RDS, 1 EC2/Lambda, ElastiCache t-class, WAF dev rules)
- **Production:** ~$520 (RDS Multi-AZ, autoscaled compute, ElastiCache, WAF + Shield, CloudFront, SES)
- **approved_total:** **$660/mo**. Overage requires human approval; spend agent monitors actuals per environment.

## 9. Risks
- Scheduled-job duplicate alerts (idempotency of "new since last run").
- Public alert/preferences endpoints → DDoS surface (WAF + rate limits).
- Email deliverability (SES reputation/bounce handling).

## 10. Open questions
- Digest send time per user timezone?
- Retention of delivered-alert history?
