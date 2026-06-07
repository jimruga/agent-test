---
name: aws-security
description: AWS network and account security posture for building infrastructure and reviewing it. Use whenever authoring CloudFormation, configuring networking/IAM, or doing an infrastructure security review. Shared by the devops engineer and security agent.
---

# AWS security posture

## Network
- Private subnets for compute and data; public subnets only for load balancers / NAT.
- Security groups least-privilege (reference SG-to-SG, not 0.0.0.0/0 except public LB 443); NACLs as a coarse second layer.
- No databases or caches with public endpoints; reach them through the VPC only.
- Terminate TLS at the edge (ALB/CloudFront); enforce TLS in transit internally where feasible.

## Identity
- IAM least privilege, one role per workload; no wildcard `*:*`. Prefer roles over users; no long-lived access keys.
- Enable CloudTrail (all regions), GuardDuty, AWS Config; centralize logs and alert on anomalies (to Slack).

## Data
- Encrypt at rest (KMS) for RDS, DynamoDB, S3, EBS, ElastiCache; block public S3 access by default.
- Secrets via Secrets Manager / KMS — see the secrets-management skill.

## Edge / DDoS
- See the ddos-protection skill for WAF + Shield + rate limiting specifics.

## Review checklist
Public exposure, IAM scope, encryption coverage, logging/auditability, secrets handling, and patch/AMI currency.
