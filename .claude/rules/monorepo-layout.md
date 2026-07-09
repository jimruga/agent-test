# Monorepo layout

npm 11 + Turborepo 2 workspace. Members are globbed by `npm-workspace.yaml`
under `apps/*` and `packages/*`. `eb-worker/` is deliberately **outside** those
globs — it ships as its own Docker image with its own lockfile.

```
apps/
├── web/          React 19 + Vite SPA — the main application
└── api/          Hono HTTP server, contract-first via openapi.yaml
packages/
└── shared/       Types/utilities shared between apps/web and apps/api
eb-worker/         Elastic Beanstalk worker (SQS -> Postgres); own image, outside workspace
localstack/        LocalStack SQS emulator image + queue init hook
```

- **`packages/shared/`** holds types/utilities shared between `apps/web` and
  `apps/api`. Keep it framework-agnostic.
- Detailed per-area conventions load on demand from the other rules in this
  directory (they carry `paths:` frontmatter): `web-conventions`,
  `api-conventions`, `worker`, etc.
- Adding anything under `apps/` makes it a workspace member and forces a
  lockfile change — which cannot be regenerated in the Claude sandbox (no
  npm-registry network). Keep independent services (like `eb-worker`) outside
  the globs.
