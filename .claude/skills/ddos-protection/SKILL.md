---
name: ddos-protection
description: Protecting production against intrusion and DDoS, and threat-modeling those controls. Use whenever designing edge/network defenses or reviewing them. Shared by the devops engineer (implementation) and security agent (threat modeling/review).
---

# Intrusion & DDoS protection

## Layered defense
- **AWS Shield** (Standard always on; Advanced for high-risk public apps) for L3/L4.
- **AWS WAF** in front of CloudFront/ALB/API Gateway: managed rule groups (OWASP), rate-based rules, geo/IP reputation, bot control as needed.
- **CloudFront** to absorb and cache at the edge, shrinking origin exposure.
- **API rate limiting / throttling** (API Gateway usage plans or app-level) per client/identity.

## Resilience
- Autoscaling and load balancing so spikes degrade gracefully, not catastrophically.
- Timeouts, circuit breakers, and backpressure on downstream calls.
- Keep origins private; only the edge is internet-facing.

## Threat-model lens (security review)
- Enumerate entry points and their limits; what happens at 10x, 100x traffic?
- Application-layer (L7) abuse: expensive endpoints, auth brute force, scraping — are they rate-limited and monitored?
- Are alerts wired to Slack with clear runbook links and an owner?
- Validate the rollback/incident path actually works (drill it).
