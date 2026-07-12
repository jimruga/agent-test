# ADR-0003 — API framework: Fastify

- **Status:** Accepted (ratified by human:Jim at Gate 3, 2026-07-09)
- **Context:** Team To-Do App (MVP), the platform's first service, sets the API precedent.
- **Supersedes:** the TDD's D1 recommendation (which proposed Hono).

## Decision
The synchronous API standardizes on **Fastify** (Node.js + TypeScript), consistent
with the CLAUDE.md stack line and the PRD.

## Context / problem
The convention corpus contradicted itself: `.claude/rules/api-conventions.md`
prescribed **Hono** (with an in-process `app.request()` test pattern and a
contract-first `make claude-gen-client` toolchain), while `.claude/CLAUDE.md`'s
stack line and the PRD named **Fastify**. As the first service, this feature must
resolve it rather than inherit ambiguity.

## Consequences
- `.claude/rules/api-conventions.md` must be **corrected from Hono to Fastify**:
  serve pattern, in-process testing via `app.inject()`, and the contract-first
  (OpenAPI → generated client) toolchain expressed in Fastify terms. This is a
  required task in **Phase-0 bootstrap**, reviewed in the first PR.
- The TDD §2 REST resource design is framework-agnostic and remains valid.
- Contract-first discipline (author `apps/api/openapi.yaml`, generate the client,
  never hand-edit generated code) is unchanged.

## Notes
Human ratified Fastify over the engineer's Hono recommendation at Gate 3; the
one-time cost is updating api-conventions.md, versus rewriting nothing on the
CLAUDE.md/PRD side.
