# Risk-Tiered Gating

> Gating everything the same way is the fastest route to making humans the
> bottleneck — which defeats the point of the team. Match scrutiny to risk: cheap
> changes flow, risky ones get the full treatment. The compliance agent assigns the
> tier (scope determination); the PM applies the gates.

## Tiers

| Tier | Examples | Gates / controls | Agents typically involved |
|---|---|---|---|
| **Trivial** | docs, copy, comments, a change fully behind an off flag | CI `all-green` + 1 review; **auto-merge on green**, no human gate | engineer, reviewer |
| **Low** | isolated bugfix, internal-only, no data/contract change | normal CI + review + security scan; **one** human approval (Gate 2) | engineer, qa, reviewer, security |
| **Standard** | a typical user-facing feature (the default) | full 9-gate lifecycle; architect at design | the core team |
| **High** | auth, payments path, schema migration, infra/security change, cross-service | standard **+ architect sign-off + security deep review + Gate 6 deploy authorizer ≠ Gate 5 merge approver** | + architect, + security, + sre |
| **Regulated** | touches financial-reporting data (SOX), cardholder data (PCI), or PII, or WCAG | High **+ compliance attestation + dual human authorization + full audit evidence** | + compliance |

## Rules
- **Default to Standard**; downgrade to Trivial/Low only when the change provably
  can't affect users, data, money, or security (a flagged-off change is Trivial
  until the flag ramps — then it re-tiers).
- **Never downgrade** a change that touches auth, money, regulated data, infra, or
  security. When unsure, tier up.
- The tier is recorded with the change (backlog + audit trail) so the gate decisions
  are themselves auditable.

## Why this matters economically
Risk tiers also decide **which agents run**, so a trivial change doesn't pay for the
architect, analyst, security deep-dive, and compliance attestation it doesn't need.
This is the main lever for keeping the team's run cost proportional to value — see
`../FLEET-OPS.md`.
