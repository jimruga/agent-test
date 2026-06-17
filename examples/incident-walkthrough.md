# Incident walkthrough — SEV2, mitigated by kill switch

Shows the reliability loop end to end: detection → mitigate-first → emergency-change
control → recovery → blameless postmortem. Uses "Saved Search Alerts" (PRD #1), now
in production behind the `saved_search_alerts` flag at 10%.

`>` = a `NEXT:` handoff the PM acts on. **AUDIT** = a hash-chained record.

---

**00:00 — Detect.** A fast-burn SLO alert fires to Slack: alert-delivery p95 jumped
to 90s (SLO < 5 min is fine, but error rate on the dispatch Lambda is 22% and
climbing). The PM dispatches the sre agent.

**00:02 — Declare.** sre opens `#inc-2026-0613-alerts`, classifies **SEV2** (partial
impact: instant alerts failing for ~10% cohort), names itself incident commander,
notifies the human.
`> NEXT: route to devops-engineer — SEV2 mitigation: kill-switch flag saved_search_alerts (dial to 0%) | gate: human:emergency-change`

**00:04 — Mitigate first.** Rather than rolling back the deploy, sre chooses the
fastest safe lever: the **kill switch**. The human authorizes the emergency action.
devops flips the flag to 0% via AppConfig — no deploy. Error rate drops immediately.
**AUDIT:** `audit-append.sh "human:jim" EMERGENCY_CHANGE flag:saved_search_alerts incident-2026-0613-alerts "kill-switch to 0% to stop failing dispatch"`

**00:10 — Diagnose.** With users protected, sre + software-engineer find root cause:
the new idempotency key (from BUG-911 in the build walkthrough) collides under a
retry burst, throwing on a unique constraint.
`> NEXT: route to software-engineer — hotfix idempotency collision, behind the flag, with a failing test first | gate: none`

**00:45 — Fix the right way.** software-engineer writes a failing test reproducing
the collision, fixes it, runs `verify.sh` (green), opens a PR. Because this is a code
change (not just a flag), it goes through the **normal gates retroactively at speed**:
CI `all-green`, reviewer + security re-review (the emergency-change retroactive
review), human approves at Gate 2.
**AUDIT:** `GATE_APPROVED PR#418@... gate-2-code "emergency hotfix; retroactive review complete"`

**01:30 — Recover.** devops deploys the fix, then **re-ramps the flag** 1% → 10%
watching the SLIs; alert-delivery SLO recovers and holds.

**Next day — Postmortem.** sre writes a blameless postmortem (postmortem-template.md)
in Notion: timeline, ~90 min partial impact, root cause (idempotency collision under
retry burst), and action items — add a retry-burst load test (QA/data), add an SLO
burn-rate alert sooner, and **add an eval case** for the collision so it can't silently
regress. Action items filed to the PM backlog.
`> NEXT: route to pm — postmortem complete; action items: retry-burst load test, earlier burn alert, new eval case | gate: none`

---

### What this exercises
Kill switch as the first lever (not rollback) · emergency-change authorized by a
human and **audit-logged** · retroactive review so the emergency path doesn't skip
controls · SLO/error-budget framing · blameless postmortem feeding the backlog **and
the eval suite**. The error budget took a hit; if it were exhausted, sre would
recommend a feature-launch freeze to the PM.
