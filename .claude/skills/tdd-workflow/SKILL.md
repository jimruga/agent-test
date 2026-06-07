---
name: tdd-workflow
description: Test-driven development discipline for implementing application and UI logic. Use whenever writing or changing code so tests are written first and behavior is verified. Shared by the software engineer and frontend engineer.
---

# Test-Driven Development

## The loop
1. **Red** — write the smallest failing test that expresses the next behavior.
2. **Green** — write the minimum code to pass it.
3. **Refactor** — improve structure with tests green. Commit at green.

## What to test
- Behavior and contracts, not implementation details — tests shouldn't break on a safe refactor.
- One logical assertion per test; descriptive names that read as a spec.
- Cover the happy path, boundaries, and error/edge cases (null, empty, large, unauthorized).
- For APIs: status codes, auth failures, validation errors, and the response schema.
- For React: render output, user interactions (Testing Library, query by role/label), and conditional states.

## Discipline
- Keep tests fast and isolated; no shared mutable state between tests.
- Mock at boundaries (network, time, randomness), not internal collaborators.
- A bug fix starts with a failing test that reproduces the bug.
- Keep coverage meaningful, not a number to game — assert outcomes that matter.
