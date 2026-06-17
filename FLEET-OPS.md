# Fleet Ops — maintaining the team, and whether it actually pays

The agents are an asset that needs maintenance and a cost that needs justifying.
This is the meta-layer the grilling flagged: who keeps the fleet good, and does the
OPEX math actually close. It's a recurring **human + eval** responsibility, not a
standing agent (adding an agent to watch the agents is cost you can avoid).

## Maintaining the fleet (recurring)
- **Evals are the regression guard.** Run `evals/` on changes to `.claude/agents/**`
  / `.claude/skills/**` and on a schedule; record first-run LLM pass-rates as
  baselines, then investigate any drift (a new model, a prompt edit, a skill change).
- **Prompts & skills are versioned code.** They live under `CODEOWNERS`; changes go
  through the same PR + review gates as app code. No silent prompt edits.
- **Turn incidents and misses into cases.** Every escaped bug, missed vuln, or bad
  routing becomes a new eval case (postmortems require it). The suite only catches
  what you've taught it.
- **Model upgrades are changes.** When a new model ships, re-baseline before adopting
  it fleet-wide; behavior shifts silently otherwise.

## The honest economics
The team's premise is OPEX down / GP up. Costs to keep on the books:
- **Build tokens** per feature (budgeted, tracked, gated).
- **Run cost of the governance agents** — reviewer, security, compliance, spend,
  sre, architect, analyst re-read context on every change they touch. This is real,
  recurring token spend that scales with throughput, and it's the cost most easily
  forgotten.
- **Human time at the gates** — five gates plus approvals. If every change pays the
  full price, humans become the bottleneck and the labor saving evaporates.
- **Maintenance** — eval upkeep, prompt/skill tuning, baseline refreshes.

## The levers that make it net-positive
- **Risk-tiered gating** (`governance/risk-tiers.md`) — trivial/low changes skip the
  architect, analyst, deep security, compliance, and the human gate, so the heavy
  machinery only runs where the risk justifies it. This is the single biggest cost
  lever.
- **The ROI loop** (`governance/roi-loop.md`) — kill low-ROI features to shed run +
  carry cost rather than accreting them forever.
- **Cheaper models for cheaper roles** — the read-only/monitoring agents run on
  smaller models where quality allows (tune per eval results).

## The question to keep asking
Measure it: build-tokens + governance-agent tokens + human-gate hours, against the
human-team cost it replaces, per unit of shipped, accepted, value-positive work. If
that ratio isn't moving the right way, the answer is fewer/cheaper agents and tighter
risk tiers — not more agents. Don't assume the saving; instrument it.
