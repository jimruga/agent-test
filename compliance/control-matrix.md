# Control Matrix

> **Indicative mapping, not an attestation.** Control IDs are referenced at a high
> level to show intent; your assessor confirms applicability and sufficiency for
> your scope. Several controls are partly or wholly **organizational** and are not
> satisfiable by the agent system alone (marked *org*).

| # | Control | Framework refs | Mechanism in this system | Evidence | Owner |
|---|---|---|---|---|---|
| 1 | Change authorized before work | SOX ITGC; NIST CM-3; ISO A.8.32; SOC2 CC8.1; PCI 6.5 | Gate 1 (human approves PRD + Jira ticket) | audit `CHANGE_AUTHORIZED`; Jira ticket | PM / human |
| 2 | Segregation of duties | SOX ITGC; NIST AC-5; ISO A.5.3; PCI 6.4.2 | maker(agents) != approver != deployer; `require_last_push_approval`; Environments | audit records; branch-protection config | compliance / human |
| 3 | Independent review & approval | SOX ITGC; NIST CM-3; SOC2 CC8.1 | reviewer+security agents assess; **human** approves at Gate 2 | PR approvals; audit `GATE_APPROVED` | human |
| 4 | Tested / verified change | SOC2 CC8.1; NIST SA-11; ISO A.8.29; PCI 6.5 | `verify.sh` + CI `all-green` (required) | CI run + commit SHA | reviewer / CI |
| 5 | Restricted prod deploy / release auth | SOX ITGC; NIST CM-5; PCI 6.4.2; ISO A.8.32 | GitHub Environment required reviewer (Gate 3), separate from merge | audit `DEPLOY_AUTHORIZED`/`DEPLOYED` | devops / human |
| 6 | Audit logging & protection | NIST AU-2/AU-3/AU-9; ISO A.8.15; SOC2 CC7.x; PCI 10 | hash-chained `audit-log.jsonl` + externalized WORM store | the audit trail; `--verify` output | compliance |
| 7 | Least privilege | NIST AC-6; ISO A.8.2/A.5.15; SOC2 CC6.1; PCI 7 | per-agent tool + `mcpServers` scopes; permission deny/ask rules; scoped IAM; sandboxed runtime | agent frontmatter; settings.json; IAM policies | security / devops |
| 8 | Periodic access review | NIST AC-2; ISO A.5.18; SOC2 CC6.2; PCI 7.2.4 | access-review skill + recurring review record | access-review record (audit) | compliance / security |
| 9 | Secrets & crypto | NIST SC-12/SC-28; ISO A.8.24; SOC2 CC6.1; PCI 3/4/8 | AWS key store; gitleaks (local+CI); no secrets in git | gitleaks CI runs; KMS/Secrets config | security / devops |
| 10 | Vulnerability & dependency mgmt | NIST RA-5/SI-2; ISO A.8.8; SOC2 CC7.1; PCI 6.3/11 | CI `sca` job: npm/pip audit (fail high+) + SBOM; lockfile installs | CI `sca` runs; SBOM artifact | security |
| 11 | Data classification & retention | NIST RA-2/SI-12; ISO A.5.12/A.5.34; SOC2 (C/P); PCI 3 | data-classification-retention skill; scope determination at PRD | classification note in PRD; retention config | data-engineer / compliance |
| 12 | Monitoring & incident response | NIST IR-4/AU-6; ISO A.5.24-26; SOC2 CC7.3/7.4; PCI 12.10 | SLO/error-budget policy; sre incident process; blameless postmortems; emergency-change control (audit-logged + retroactive review) | reliability/ docs; postmortems; `EMERGENCY_CHANGE` audit records | sre / devops |
| 13 | Backup / DR (RTO/RPO) | NIST CP-9/CP-10; ISO A.8.13; SOC2 A1.2/A1.3 | backup config (PITR/snapshots/replication, KMS) + **scheduled restore drills** | reliability/disaster-recovery.md; `DR_DRILL` records | devops / sre |
| 15 | Agent integrity / injection defense | NIST SI-10 (input validation); SC-7 (boundary); SA-15 | untrusted-content boundary; egress allowlist; sandbox; secrets never in context | SECURITY-POSTURE.md; settings.json; agent prompts | security / compliance |
| 16 | Risk-tiered change governance | SOX ITGC; NIST CM-3; SOC2 CC8.1 | tiers (trivial→regulated) decide gates + agents applied; proportional control | governance/risk-tiers.md; tier recorded per change | compliance / pm |
| 14 | Risk assessment, vendor & HR/physical | SOC2 CC3/CC9; ISO A.5/A.6/A.7 | *org* — outside the agent system | org policies | *org* |

Gaps (10, 12, 13) and *org* rows are deliberately honest: the agent system does not
cover them yet. Close the technical ones via the roadmap from the grilling.
