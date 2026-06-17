# Audit Trail

> Maps to NIST **AU-2/AU-3** (audit events/content), **AU-9** (protection of audit
> info), ISO **A.8.15** (logging), SOC 2 **CC7.x**, PCI **Req 10**, SOX ITGC.

## What we record
Every authorization and material action: change authorization (Gate 1), code push,
review/security/compliance attestations, merge approval (Gate 2), deploy
authorization + result (Gate 3), metrics approval (Gate 4), acceptance (Gate 5),
budget-overage approvals, and access reviews. Each record has: sequence, UTC
timestamp, actor (human identity or agent id), event, ref (commit SHA / PR / Jira
id), gate, detail.

## Tamper-evidence (local) — hash chain
`compliance/audit-log.jsonl` is append-only and **hash-chained**: each record
embeds the SHA-256 of the previous record. Altering or deleting any past entry
breaks the chain. Verify any time:

    ./.claude/hooks/audit-append.sh --verify

The compliance agent runs this on every review and flags a broken chain as a
control failure. Agents append via:

    ./.claude/hooks/audit-append.sh <actor> <event> <ref> <gate> <detail>

## True immutability (required for audit) — externalize
A local file an agent can append to is tamper-*evident*, not tamper-*proof*. For
audit-grade retention, ship the chain to an append-only store **outside the
agents' write scope**:
- **CloudWatch Logs** (dedicated log group, cross-account destination, retention set), or
- **S3 with Object Lock (compliance mode)** / Glacier for WORM retention, or
- **Amazon QLDB** for a cryptographically verifiable ledger.

The external store is the **system of record** for auditors; the local chain is the
working copy and integrity check.

## Operational requirements
- **Time sync** (NTP/chrony) so timestamps are trustworthy (PCI 10.6).
- **Retention** per framework (commonly >= 1 year readily available; PCI >= 1 year,
  3 months immediately available). Set on the external store, not the repo.
- **Restricted access**: only humans/compliance read the full external trail; no
  agent has delete rights on it.
