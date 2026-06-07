---
name: software-design-patterns
description: Design patterns and architecture principles for writing and reviewing maintainable code. Use whenever structuring application logic or reviewing a change for maintainability and sound design. Shared by the software engineer and code reviewer.
---

# Design patterns & principles

## Principles first
- SOLID, especially single responsibility and dependency inversion (depend on abstractions at boundaries).
- Separation of concerns: keep transport, business logic, and persistence in distinct layers.
- Prefer composition over inheritance; keep functions small and cohesive.
- DRY without premature abstraction — duplicate twice before extracting.
- Make illegal states unrepresentable; validate at the edge, trust within.

## Patterns that earn their keep
- Repository / data-access layer to isolate persistence.
- Strategy for interchangeable behavior; Factory for construction complexity.
- Adapter for third-party/integration boundaries (e.g., OAuth providers, AWS SDKs).
- Dependency injection for testability.

## Review lens (maintainability)
- Would a new engineer understand this in six months? Names, boundaries, and flow should answer yes.
- Watch for: god objects, leaky abstractions, hidden side effects, primitive obsession, and clever code that resists change.
- Error handling is explicit and consistent; no swallowed exceptions.
