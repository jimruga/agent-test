# Segregation of Duties (SoD)

> Not legal advice. This is the SoD model the team operates under; your auditors
> validate whether it satisfies a given framework for your systems.

## The problem this solves
An AI that writes, reviews, approves, and deploys its own code collapses SoD —
there is no independent control. SOX ITGC, NIST **AC-5**, ISO **A.5.3**, PCI
**6.4.2**, and SOC 2 change-management criteria all assume the maker is not the
checker is not the releaser.

## The model: agents make, humans authorize
Treat the entire agent fleet as **"the developer."** The independent controls are
**human and required**:

| Control point | Who | Maps to |
|---|---|---|
| **Authorize the change** (before work) | Human — Gate 1 (PRD/ticket) | Change request / authorization |
| **Approve the merge** (independent of author) | Human — Gate 2 | Independent review/approval |
| **Authorize the production deploy** (separate from merge) | Human — Gate 3, via a GitHub Environment required reviewer | Restricted prod change; release authorization |
| **Accept the result** | Human — Gate 5 | Change verification/closure |

The reviewer and security **agents** assess and recommend; they do **not** hold
authorization. The compliance agent **attests** to evidence completeness; it does
**not** approve. Authorization always rests with a human.

## Enforced, not just documented
- `require_last_push_approval = true` (branch protection, see #1): the identity
  that last pushed cannot be the approver — the maker can't check their own work.
- `CODEOWNERS` + a repository ruleset require an owner's review on sensitive paths
  (`migrations/`, `infrastructure/`, `compliance/`).
- **Production deploy** runs through a **GitHub Environment** with a required human
  reviewer, so "merge to main" and "release to prod" are distinct authorizations
  (ideally distinct people for financial-reporting systems).
- Least-privilege IAM/tool scopes per agent (see access-review skill) so no single
  agent has both develop and deploy capability.

## For SOX / financial-reporting scope
If a change touches a financially-relevant system, the deploy authorizer (Gate 3)
should be a different human from the merge approver (Gate 2). Record both
identities and timestamps in the audit trail.
