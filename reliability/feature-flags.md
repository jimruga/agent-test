# Feature Flags — registry & lifecycle

How the team uses flags day to day. The mechanics/skill are in
`.claude/skills/feature-flags-progressive-delivery/`; this is the operational
registry and lifecycle discipline.

## Registry
Every flag is tracked in `reliability/flags-registry.json` with an owner, type,
default, current rollout, and an **expiry**. Flags without an owner or expiry are
not allowed — they become invisible dead branches.

## Lifecycle
1. **Create** — software/frontend engineer adds the flag (default off), records it
   in the registry with owner + expiry; wires the kill switch if user-facing/risky.
2. **Roll out** — devops ramps per the progressive-delivery plan, watching SLIs;
   sre sets the guardrails and auto-halt thresholds.
3. **Stabilize** — at 100% and healthy for the agreed soak window.
4. **Remove** — delete the flag and the dead branch; update the registry. The
   reviewer flags release flags that linger past expiry.

## Kill switch
A kill-switch (ops) flag is the **first incident lever** — it disables a risky path
instantly with no deploy. Every risky user-facing rollout ships with one.

## Rules
- Evaluate security/permission/money-relevant flags **server-side**; never trust the
  client to hide a privileged path.
- No secrets in flag names or payloads.
- Log kill-switch flips and other significant flag changes to the audit trail.
