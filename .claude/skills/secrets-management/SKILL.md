---
name: secrets-management
description: Handling secrets and keys with AWS Secrets Manager / KMS so nothing sensitive ever reaches GitHub. Use whenever code, infrastructure, or config touches credentials, API keys, tokens, or certificates. Shared by the software engineer, frontend engineer, devops engineer, and security agent.
---

# Secrets & key management (AWS key store)

**Rule zero: secrets and keys are never committed to GitHub** — not in code, config, env files, CloudFormation parameters, test fixtures, or commit history.

## Where secrets live
- Application/API/runtime secrets: **AWS Secrets Manager** (with rotation) or **SSM Parameter Store** (SecureString) for simpler config.
- Encryption keys: **AWS KMS**; reference keys by ARN, never inline key material.
- Fetch at runtime via IAM role (instance profile / Lambda execution role) — no long-lived static credentials baked into images or bundles.

## Practices
- Frontend bundles contain no secrets; SPAs use OAuth2 PKCE (see oauth2-patterns).
- CloudFormation references secrets dynamically (`{{resolve:secretsmanager:...}}` / SSM dynamic refs), not literal values.
- Scope IAM to least privilege per service; one role per workload.
- Rotate credentials and keys on a schedule and after any suspected exposure.
- Keep `.env`, `*.pem`, key files, and credential patterns in `.gitignore`; add a pre-commit secret scanner (e.g., gitleaks) to block accidental commits.

## On exposure
If a secret reaches git history, treat it as compromised: rotate it immediately, then purge history. Rotation first — history rewriting does not un-leak it.
