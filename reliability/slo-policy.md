# SLOs & Error-Budget Policy

> Maps to SOC 2 A1.x (availability), NIST AU-6 (monitoring), and is the runtime half
> of control #12. The sre agent owns this; data-engineer instruments the SLIs.

## SLIs (what we measure)
Per user-facing service: **availability** (successful / total requests),
**latency** (p95 / p99), and **error rate**. Measured from the edge where the user
experiences it, not just server-internal.

## SLOs (targets) — set per service in the PRD
Example starting targets (tune per service): availability 99.9% / 30 days; p95
latency < 300 ms; error rate < 0.1%. Each SLO names its SLI, target, and window.

## Error budget
`error budget = 1 − SLO` over the window (99.9% ⇒ 0.1% ≈ ~43 min/month of allowed
unavailability). The budget is the shared currency between shipping speed and
reliability.

## Error-budget policy (the control that gates feature work)
- **Budget healthy** → normal/aggressive rollout pace; more change is fine.
- **Budget low (e.g., <25% left)** → slow rollouts, raise rollout scrutiny.
- **Budget exhausted** → **feature-launch freeze**: the sre agent recommends to the
  PM that new feature rollouts pause and effort shifts to reliability until the
  budget recovers. This is a recommendation to the human, who decides.

## Alerting
Alert on **SLO burn rate** (fast-burn = page; slow-burn = ticket), not on every
blip — page on user-impacting symptoms, not cause noise. Alerts go to Slack with a
runbook link and an owner (see incident-response.md). Multi-window burn-rate alerts
reduce false pages.
