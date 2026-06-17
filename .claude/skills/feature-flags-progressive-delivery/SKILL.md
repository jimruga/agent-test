---
name: feature-flags-progressive-delivery
description: Ship code dark behind flags and roll it out progressively with a kill switch, instead of all-or-nothing deploys. Use whenever building, deploying, or rolling out a user-facing change. Shared by the software engineer, frontend engineer, and devops engineer.
---

# Feature flags & progressive delivery

Rollback is slow and risky as the only lever. Decouple **deploy** (code is live but
off) from **release** (behavior is turned on) so you can ramp and, critically,
**turn a change off instantly without a deploy**.

## Flag types
- **Release** — gate new behavior; default off; ramp on.
- **Kill switch (ops)** — disable a risky path instantly; the first incident lever.
- **Experiment** — cohort/percentage splits for measurement.
- **Permission** — gate by entitlement (evaluate **server-side**; never trust the client for security-relevant gating).

## Provider
AWS **AppConfig** (fits the AWS stack; native, auditable) or an **OpenFeature**-
compatible provider. Evaluate flags server-side for anything security- or
money-relevant; the client only reflects the decision.

## Progressive rollout
Deploy dark → enable for internal/canary cohort → 1% → 10% → 50% → 100%, **watching
the SLIs at each step** (see slo-policy.md). Wire **auto-halt / auto-rollforward-off**
on an SLO breach so a bad release de-escalates itself. The kill switch is always the
fast path back to safe.

## Hygiene (flags are debt)
- Every flag has an **owner**, a **default**, and an **expiry** in the registry
  (`reliability/flags-registry.json`).
- Remove a flag once it's at 100% and stable — stale flags rot into dead branches
  and surprise behavior. The reviewer flags long-lived release flags.
- No secrets in flag values; flag *names* and payloads are not a secrets channel.
- Flag state changes are operational events — log significant ones (kill-switch
  flips) to the audit trail.
