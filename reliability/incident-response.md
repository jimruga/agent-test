# Incident Response

> Control #12 (monitoring & incident response): NIST IR-4, ISO A.5.24–26, SOC 2
> CC7.3/7.4, PCI 12.10. The sre agent is incident commander; prod actions are human-
> authorized and audit-logged. On-call rotation/paging is an *operational* control
> your org runs (PagerDuty/Opsgenie); this doc is the process the team follows.

## Severity
- **SEV1** — major outage / data risk / security breach. All-hands, page now.
- **SEV2** — significant degradation, partial impact. Urgent, mitigate fast.
- **SEV3** — minor/contained, no broad user impact. Handle in hours.

## The loop
1. **Detect** — SLO burn-rate alert (slo-policy.md) fires to Slack.
2. **Declare & classify** — sre opens an incident channel, sets severity, names the
   incident commander (sre) and a comms owner; notifies the human.
3. **Mitigate first** — least-risky lever wins: **kill-switch / flag dial-down →
   rollback → hotfix**. Restore the user before chasing root cause.
4. **Coordinate** — sre routes execution (devops flips the flag / rolls back;
   software-engineer prepares a hotfix behind a flag). The PM (main session)
   dispatches; the human authorizes any prod action.
5. **Recover & verify** — confirm via the post-deploy health check + SLI recovery.
6. **Postmortem** — blameless, within a few days (postmortem-template.md); action
   items to Jira / the PM backlog.

## Emergency change control (stays auditable)
Incidents bypass the normal 5-gate lifecycle, but not accountability:
- A **human authorizes** the emergency mitigation (kill-switch / rollback / hotfix).
- It is recorded to the audit trail:
  `./.claude/hooks/audit-append.sh "human:<name>" EMERGENCY_CHANGE <ref> incident-<id> "<what + why>"`.
- A **retroactive review** (reviewer + security as applicable) and the **postmortem**
  close the loop, so the emergency path can't become a way to skip controls.

## Roles
- **Incident commander** — sre (coordinates, decides strategy, owns the timeline).
- **Operators** — devops (infra/flags/rollback), software-engineer (hotfix).
- **Authorizer** — human (approves prod actions).
- **Comms** — keeps the Slack channel + stakeholders updated.
