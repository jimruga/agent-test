---
name: legacy-refactoring
description: Safely change existing/legacy code without altering behavior — characterization tests first, small behavior-preserving steps, seams, and the strangler-fig pattern for larger rewrites. Use whenever refactoring, restructuring, or fixing a bug in code you didn't just write. Shared by the software engineer, architect, and QA engineer.
---

# Legacy / safe refactoring

The cardinal rule: **a refactor preserves behavior.** If behavior should change,
that's a feature/fix — do it in a *separate* change with its own tests, not smuggled
into a refactor.

## Step 0 — pin current behavior first (non-negotiable)
You cannot safely change code you can't verify. Before touching legacy code, add
**characterization tests** (a.k.a. golden-master): tests that capture what the code
*actually does today* (even if it looks wrong — capture it, don't fix it yet). For
hard-to-test code, find a **seam** (an injection point — parameter, interface, env)
to get the code under test without rewriting it first. No safety net → no refactor.

## The loop
1. Characterization tests green against the existing behavior.
2. Make **one small** structural change.
3. Run `./verify.sh` — tests still green (behavior unchanged).
4. Commit. Repeat. Small steps make a bad step obvious and revertible.

Never "improve" tests to make a refactor pass (the anti-tamper check will reject
deleting/`.skip`/`.only`-ing them, and so will the reviewer).

## Bug fixes in existing code
Start with a **failing test that reproduces the bug** (this is the behavior you *do*
want to change), fix the code to make it pass, keep all other tests green. The ticket
is the authorization; tier it Low/Standard (governance/risk-tiers.md).

## Larger rewrites — strangler fig
Don't big-bang rewrite. Stand the new implementation up alongside the old, route a
slice of traffic/calls to it behind a **feature flag**, verify parity, expand
gradually, then retire the old path. Behavior parity is checked continuously, and the
flag is the instant rollback.

## Tiering & coherence
Small in-place cleanup → Low. Structural / cross-module / contract-affecting → High:
loop in the **architect** (coherence + ADR) and run the full gates. Record
non-trivial structural decisions as ADRs.
