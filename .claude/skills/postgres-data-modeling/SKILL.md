---
name: postgres-data-modeling
description: Relational data modeling and schema design for AWS RDS PostgreSQL, including when to reach for DynamoDB. Use whenever designing tables, relationships, indexes, or planning schema changes. Shared by the software engineer and data engineer (who owns migrations).
---

# PostgreSQL data modeling

## Modeling
- Normalize to 3NF first; denormalize deliberately for measured read paths.
- Choose keys intentionally: surrogate (identity/UUID) vs natural; UUIDv7 if you need sortable, non-guessable IDs.
- Model relationships with real foreign keys and `ON DELETE` behavior chosen on purpose.
- Use appropriate types: `timestamptz` (never naive timestamps), `numeric` for money, `jsonb` for semi-structured data, enums or check constraints for closed sets.
- Push integrity into the DB: `NOT NULL`, unique, check, and FK constraints.

## Performance
- Index foreign keys and frequent filter/sort columns; use composite and partial indexes for real query shapes. Measure with `EXPLAIN ANALYZE` before adding indexes.
- Beware N+1 access patterns; paginate with keyset pagination for large sets.

## Postgres vs DynamoDB
- Postgres (default): relational integrity, ad-hoc queries, transactions, joins.
- DynamoDB: known single-key access patterns, very high scale, predictable latency — design the access patterns first; it is not a relational store.

See the `db-migrations` practice in the data-engineer agent for the change/rollout process.
