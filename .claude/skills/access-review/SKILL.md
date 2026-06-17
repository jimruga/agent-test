---
name: access-review
description: Run periodic least-privilege access reviews across IAM roles, GitHub access, and agent tool/connector scopes, and produce a reviewable record. Use on a recurring cadence and whenever access changes. Shared by compliance, security, and devops.
---

# Access review

Maps to NIST AC-2/AC-6, ISO A.5.18, SOC 2 CC6.2/6.3, PCI 7.

## What to review (recurring — e.g. quarterly, and on any change)
- **AWS IAM:** roles/policies per workload; flag wildcards (`*:*`), unused roles,
  long-lived access keys, and anything broader than the job needs.
- **GitHub:** who has write/admin; branch-protection settings; CODEOWNERS currency;
  that `require_last_push_approval` and required checks are still enforced.
- **Agent scopes:** each agent's `tools`/`disallowedTools`/`mcpServers` — confirm
  least privilege (e.g., read-only agents still can't write; no agent has both
  develop and deploy capability).
- **Secrets:** rotation currency; who/what can read each secret.

## Principles
- **Least privilege & need-to-know:** grant the minimum; remove on role change.
- **Joiners/movers/leavers:** provision and **deprovision** promptly (*org* process).
- **No standing prod admin** for agents; prefer scoped, time-bound, audited access.

## Output
A dated access-review record: what was reviewed, findings, remediations, and
sign-off. Append a summary to the audit trail (`ACCESS_REVIEW`) and route findings
to the owner (security/devops) and any gap to the PM/human.
