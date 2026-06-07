---
name: test-data
description: Fabricating and using realistic, privacy-safe test datasets. Use whenever generating data for tests or consuming it in test suites. Shared by the data engineer (fabrication) and QA engineer (usage).
---

# Test data

**Never derive test data from production PII.** Synthesize it.

## Fabrication (data engineer)
- Match real schema, types, constraints, and realistic distributions (not all-uniform).
- Cover edge cases on purpose: nulls, empties, max lengths, unicode, boundary numbers, timezones, duplicates, referential edge cases.
- Make generation deterministic with a seed so runs are reproducible.
- Provide fixtures at useful sizes: tiny (unit), medium (integration), large (performance).
- For realistic-looking PII, use synthetic generators (e.g., Faker) — never real users.

## Usage (QA)
- Reset/seed state per test for isolation; no cross-test dependencies.
- Use the smallest dataset that exercises the behavior; reserve large sets for perf tests.
- Assert on data-driven outcomes, including the edge fixtures above.
- Keep fixtures versioned alongside tests; regenerate from the seeded generator rather than hand-editing.
