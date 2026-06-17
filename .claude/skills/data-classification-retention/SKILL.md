---
name: data-classification-retention
description: Classify data by sensitivity (public/internal/confidential/regulated incl. PII and cardholder data) and apply handling + retention rules. Use whenever a change stores, processes, logs, or moves data, or when determining compliance scope. Shared by compliance, data-engineer, and security.
---

# Data classification & retention

## Classify first
- **Public** — no restriction.
- **Internal** — business data, not for outside.
- **Confidential** — sensitive business/customer data.
- **Regulated** — **PII** (privacy laws) and **cardholder data / CHD** (PCI). CHD
  pulls the storing system into PCI scope; minimize and isolate it.

The classification of a feature's data determines which controls and gates apply
(SOX for financial data, PCI for CHD, privacy for PII). Record it in the PRD.

## Handling rules
- Minimize: collect and retain the least data needed; tokenize/avoid storing CHD
  where possible (PCI 3). Never log secrets, full PAN, or unnecessary PII.
- Encrypt regulated data at rest (KMS) and in transit (TLS).
- Keep regulated data out of test fixtures, metrics, and audit detail fields —
  reference by id, not value.
- Access on need-to-know (least privilege); see the access-review skill.

## Retention
- Define a retention period per data class and **enforce it** (lifecycle policies,
  scheduled deletion) — retention is a control, not a default.
- Honor deletion/erasure requests for PII where the law requires.
- PCI: retain only what's justified; document retention and secure disposal.
- Audit/log data has its own (usually longer) retention — see audit-trail.md.
