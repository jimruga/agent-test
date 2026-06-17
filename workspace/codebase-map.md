# Codebase Map — <repo / system>

> Produced by the architect on first contact with an existing codebase and kept
> current. It orients every fresh-context subagent (linked from `workspace/index.md`).
> Bootstrap the conventions half with Claude Code's `/init` on the repo, then the
> architect fills in assessment + backlog.

## Architecture overview
What the system is, its major services/modules, how they talk (sync/async, APIs,
events), and a one-paragraph "how a request flows through it."

## Key modules / services
| Module / service | Responsibility | Language/stack | Owner | Notes |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

## Data stores & integrations
Databases (and what owns each), caches, queues, external/third-party integrations,
and where secrets come from.

## Conventions (the real ones, from the code)
Naming, error handling, layering, test layout, build/run commands, branch/PR norms.
(Merge into the project `CLAUDE.md` so agents follow existing patterns, not greenfield
assumptions.)

## Health assessment
- **Test coverage state:** where it's strong / absent (refactor blockers).
- **Tech-debt hotspots:** complex/churny/fragile areas (rank by risk × change-frequency).
- **Dead code / unused paths.**
- **Dependency & security debt:** outdated/vulnerable deps, EOL runtimes (cross-ref the CI `sca` job).
- **Coherence issues:** duplicated patterns, divergent approaches to the same problem.

## Prioritized refactor backlog
| # | Area | Problem | Risk if untouched | Effort | Tier | Pre-req (characterization tests?) |
|---|---|---|---|---|---|---|
| 1 | ... | ... | ... | ... | Low/Std/High | yes/no |

Refactors are behavior-preserving (see the `legacy-refactoring` skill); each item
enters the normal flow tiered by blast radius, characterization tests first.
