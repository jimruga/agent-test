# ROI Loop

> The premise of the whole team is OPEX down / GP up. That only holds if you can see,
> per feature, whether the value beat the cost — and act on it. This is the loop that
> closes from "shipped" back to "worth it?". Owned by the analyst, decided by the PM + human.

## The loop
1. **Estimate (PRD / Gate 1).** PM estimates the build token budget; devops estimates
   AWS run cost (staging + prod). Both are recorded in the PRD and `budget.json`.
2. **Track (during build).** The budget hook + spend agent track build tokens against
   the estimate; the spend agent tracks actual AWS spend per environment.
3. **Measure (post-launch).** The data-engineer's instrumentation reports whether the
   feature hit its PRD success metrics; the spend agent reports steady-state run cost.
4. **Judge (recurring).** The **analyst** computes realized ROI — value vs (build
   tokens + run cost) — and recommends **keep / iterate / kill**.
5. **Act.** The PM + human decide. **Killing a low-ROI feature is a win**, not a
   failure — it sheds run cost and maintenance. Retirement goes back through the
   normal change process (and removes its feature flag).

## What "cost" includes (be honest)
- **Build cost:** tokens to design/build/test/review (from `budget.json`).
- **Run cost:** AWS monthly (the feature's share).
- **Carry cost:** the ongoing maintenance + the share of the governance agents
  (review/security/compliance/sre) that every live feature keeps consuming — easy to
  forget and the reason a feature can be net-negative even if "done." See FLEET-OPS.md.

## Honest limit
Business *value* is often not cleanly measurable (attribution, halo effects). State
assumptions explicitly; an ROI readout is a decision aid, not a verdict. Don't kill
on a noisy metric, and don't keep on a vibe.
