# syntax=docker/dockerfile:1
#
# Local-dev image for apps/api (Team To-Do). NOT a production build — it ships
# devDependencies (tsx, knex) and runs the server with a file watcher. Production
# compute is EC2/Lambda via CloudFormation (ADR-0002), built separately.
#
# No secrets are ever baked in: all config/secrets arrive from the compose
# environment (see .env / .env.example) at runtime.

########################################################################
# deps — resolve the full npm workspace from the committed lockfile
########################################################################
FROM node:26-bookworm-slim AS deps
WORKDIR /app

# Copy manifests first so this layer (the slow `npm ci`) is cached until a
# dependency actually changes. npm workspaces resolves EVERY member against the
# single root lockfile, so each member's package.json must be present or
# `npm ci` fails validating the tree. Keep this list in sync with the
# `workspaces` globs in the root package.json (apps/*, packages/*).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

# Deterministic install (devDependencies included — this is a dev image). This
# also creates the workspace symlinks node_modules/@repo/* -> ../packages/... so
# apps/api resolves @repo/shared correctly.
RUN npm ci

########################################################################
# dev — hot-reloading API (tsx watch)
########################################################################
FROM node:26-bookworm-slim AS dev
ENV NODE_ENV=development
WORKDIR /app

# Bring the resolved workspace node_modules (with @repo/* symlinks) from deps.
COPY --from=deps /app/node_modules ./node_modules

# Copy the source so the image is runnable on its own. At runtime compose
# bind-mounts the repo over /app for hot-reload, while anonymous volumes
# (declared in compose.yaml) preserve the node_modules baked here. node_modules
# is excluded by .dockerignore so this copy never clobbers the layer above.
COPY . .

WORKDIR /app/apps/api
EXPOSE 3001

# tsx watch is the cleanest Node 26 dev runner: it owns its TS/ESM loader in a
# worker thread, avoiding the DEP0205 deprecation of self-wiring
# `node --import tsx`. Migrations are run first by the compose command; this is
# the standalone fallback when the image is run without that override.
CMD ["../../node_modules/.bin/tsx", "watch", "src/index.ts"]
