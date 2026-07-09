---
paths:
  - "eb-worker/**"
  - "localstack/**"
---

# EB worker + LocalStack (SQS -> Postgres)

`eb-worker/` is a **self-contained Elastic Beanstalk worker**: its own npm
lockfile and Docker image, deliberately **outside** the npm workspace globs
(`apps/*`, `packages/*`) so it can't invalidate the API image's frozen-lockfile
install. Don't move it under `apps/`.

- **It polls SQS directly.** A real EB worker tier receives messages via the
  platform `sqsd` daemon (HTTP POST); LocalStack has no `sqsd`, so the local
  worker long-polls the queue itself, writes each message to Postgres, then
  deletes it on success. Preserve graceful shutdown (SIGINT/SIGTERM).
- **Config is env-driven**: `DATABASE_URL`, `AWS_ENDPOINT_URL` (points at
  LocalStack locally), `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `SQS_QUEUE_NAME` / `SQS_QUEUE_URL`.
- **LocalStack** (`localstack/`) emulates SQS. It auto-runs scripts in
  `/etc/localstack/init/ready.d/` once ready — the queue is created there
  (idempotently). Keep queue provisioning in that init hook.
- Runtime is `tsx`; deps are AWS SDK SQS client + `pg`. This service is not part
  of the Vite/Turbo web build.
