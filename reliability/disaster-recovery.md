# Disaster Recovery (backup & restore)

> Control #13: NIST CP-9/CP-10, ISO A.8.13, SOC 2 A1.2/A1.3. devops owns the
> mechanism; sre owns the targets and validates drills. An untested backup is a
> guess, not a control.

## Targets (set per service in the PRD/architecture)
- **RPO** (recovery point objective) — max acceptable data loss (e.g., 5 min).
- **RTO** (recovery time objective) — max acceptable time to recover (e.g., 1 hour).
These drive the backup frequency and the recovery design.

## Backups
- **RDS Postgres:** automated backups + point-in-time recovery; periodic snapshots;
  store cross-region for region-failure resilience.
- **DynamoDB:** point-in-time recovery enabled; on-demand backups for milestones.
- **Object/state:** S3 versioning + cross-region replication where the RPO requires.
- Backups are **encrypted** (KMS) and their access is least-privilege (no agent has
  delete rights on backups or the backup config).

## Restore — the part that's actually the control
- **Test restores on a schedule** (e.g., quarterly DR drill): restore to an isolated
  environment, verify data integrity and that the app comes up, and **measure actual
  RTO/RPO** against target. A backup you've never restored is unverified.
- Drills are run by devops, validated by sre, and recorded (drill date, measured
  RTO/RPO, gaps) — file the record to the audit trail (`DR_DRILL`).

## In an incident
DR is the last resort, below kill-switch and rollback (see incident-response.md).
Restoring from backup is a SEV1-class action: human-authorized emergency change,
audit-logged, postmortem to follow.

## Honest status
The mechanisms above are configuration in **your** infrastructure; this doc is the
policy and the discipline. The control isn't "real" until the first successful,
measured restore drill — schedule it.
