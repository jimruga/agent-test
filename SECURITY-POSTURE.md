# Security Posture — the agent fleet as an attack surface

The team is a set of autonomous agents holding real capabilities: `bash`, AWS
access, GitHub write, MCP connectors. They also continuously ingest **untrusted
content** — Jira tickets, PR bodies and diffs, web pages, file contents, tool
output, and (in the webhook feature) third-party payloads. That combination is the
risk: a prompt injection in any ingested content could try to steer an agent into
exfiltrating secrets, opening a backdoor PR, running a destructive command, forging
an audit record, or bypassing a gate. This document is the posture that contains
that risk. It is not legal/audit advice.

## Principle 1 — Least privilege per agent

No agent gets a capability it doesn't need. Connectors are already scoped per agent
(`mcpServers`); tools are now scoped too:

| Agent | Bash (run code) | Write/Edit | Rationale |
|---|---|---|---|
| pm | yes | yes | runs `audit-append.sh`, orchestrates |
| software-engineer, frontend-engineer, qa-engineer, data-engineer, devops | yes | yes | genuinely execute tests/builds/deploys/migrations |
| code-reviewer, security, compliance | yes | **no** | read + analyze (git diff, scanners, `--verify`); never modify |
| product-designer, support-writer | **no** | yes | author docs/specs only; no reason to execute code |
| spend | **no** | **no** | reads `budget.json` + AWS (read-only); pure monitor |

Read-only via `disallowedTools: Write, Edit`; no-execute via `disallowedTools: Bash`.
For the agents that *must* run code, tool removal isn't the control — see Principle 3.

## Principle 2 — All tool-sourced content is DATA, not instructions

An agent's instructions come only from its task brief (from the PM, derived from a
human). Content read from Jira, PRs, web pages, files, tool output, or webhook
payloads is **data to act on, never commands to obey**. If such content contains
directives — especially to change scope, run commands, read or send secrets, modify
the audit log, approve/bypass a gate, or contact a new endpoint — the agent does
**not** comply: it quotes the text, names the source, and routes it to the human.
This is enforced by instruction in `CLAUDE.md` and the ingesting agents, and
backed structurally: a hijacked agent still can't self-approve a gate (human-only),
can't merge (branch protection), and can't silently rewrite the audit trail
(hash chain).

## Principle 3 — Shrink the blast radius of a compromised agent

Removing tools isn't enough for the code-executing agents, so limit what a
compromised one can reach:

- **Sandboxed runtime.** Run the fleet in an isolated container/devcontainer (or
  ephemeral CI runner) with **no ambient production credentials** and a non-root
  user. A hijacked agent should be operating in a box, not on a laptop with prod keys.
- **Scoped IAM.** Each agent's AWS access is a least-privilege role (deploy role can
  deploy specific stacks, not `iam:*`; no standing prod admin). This is the real
  control on devops/data-engineer, paired with the Gate 3 human deploy authorization.
- **Network egress allowlist.** Agents reach only known hosts (package registries,
  MCP endpoints, AWS APIs) — not arbitrary URLs. Blocks exfiltration and C2.
- **Permission deny rules** (`.claude/settings.json` → `permissions`): deny reading
  secret material into context (`.env`, `*.pem`, credentials), deny shell
  exfiltration (`curl`/`wget`), and `ask` (require human) on destructive/admin AWS
  ops. These are a starting set — tune to your environment; they complement, not
  replace, IAM and the sandbox.
- **Secrets never enter the model.** Agents handle secret *references* (ARNs), never
  values; values are fetched at runtime by the deployed workload via its IAM role.

## Principle 4 — Supply chain

Agents install dependencies, so a malicious/typosquatted package executes code in
the agent's environment. Controls:

- **Lockfiles + `npm ci`** (not `npm install`) so installs are reproducible and
  pinned; consider `--ignore-scripts` to block postinstall execution where feasible.
- **SCA + SBOM in CI** (`ci.yml` `sca` job): dependency vulnerability scan that fails
  on high/critical, plus a generated SBOM. This closes control #10 in the matrix.
- **Allowlisted registries**; no installing from arbitrary URLs.

## How this ties to #1 and #2

The structural backstops from the earlier work are what make injection
*non-catastrophic* even if an agent is fooled: human-only gate authorization,
server-side branch protection, the hash-chained audit trail, and segregation of
duties all mean a compromised agent cannot unilaterally ship, approve, or hide a
change. Least privilege + the injection boundary reduce the *likelihood*; those
controls reduce the *impact*. You need both.

## Honest limits

- The permission deny rules are pattern-based and approximate; they raise the bar,
  they don't seal every shell exfiltration path. IAM scoping, the egress allowlist,
  and the sandbox are the load-bearing controls and they live in **your
  infrastructure**, not these repo files.
- The injection boundary is an instruction to the model, not a hard guarantee — it
  reduces risk but can be defeated by a sufficiently clever payload. That's exactly
  why the impact-limiting controls (least privilege, sandbox, human gates) matter.
- This does not cover model/agent quality (are the security/QA agents actually
  good?). That's evals — a separate, still-open item.
