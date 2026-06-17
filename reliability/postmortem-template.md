# Postmortem — <incident id / short title>

> Blameless: describe what the **system** allowed, not who to blame. Goal is
> learning and prevention. Owner: sre. Store in Notion; link from the audit record.

- **Date / duration:** <start – end, total impact time>
- **Severity:** SEV<1|2|3>
- **Authors / responders:** <names/agents>

## Impact
What users/business experienced; scope (%, regions, $ if known); SLO/error-budget burn.

## Timeline (UTC)
- HH:MM — detection (which alert)
- HH:MM — declared SEV<x>, IC = <sre>
- HH:MM — mitigation (kill-switch flag <name> / rollback <stack>) — authorized by <human>
- HH:MM — recovery confirmed (health check + SLI recovery)
- HH:MM — resolved

## Root cause
The technical and **contributing systemic** causes (what made this possible / hard to
catch). Use "5 whys"; stop at systems, not individuals.

## What went well / what was hard
Honest notes on detection, response, tooling, comms.

## Action items (file in Jira → PM backlog)
| Action | Type (prevent/detect/mitigate) | Owner | Due |
|---|---|---|---|
| ... | ... | ... | ... |

## Controls / follow-ups
- Emergency-change retroactive review status: <done/pending> (reviewer + security)
- Audit record ref: `EMERGENCY_CHANGE incident-<id>`
- New eval case added for this failure mode? <yes/no — every incident becomes a case>
