# Handoff log (append-only)

> One line per handoff, decision, conflict resolution, and human approval.
> Format: `<timestamp> | <from> -> <to> | <summary> | gate: <none|human:...> | <approved-by?>`

<!-- examples
2026-06-03T10:00 | human -> pm | new feature: saved-search alerts | gate: none |
2026-06-03T11:20 | pm -> human | PRD ready for review | gate: human:gate-1-prd | APPROVED by Jim
2026-06-03T14:05 | qa-engineer -> software-engineer | BUG-412 null token on refresh | gate: none |
-->
