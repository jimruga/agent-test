.PHONY: help install dev build test lint typecheck check test-e2e gen-client clean \
	claude-install claude-build claude-test claude-lint claude-lint-fix \
	claude-typecheck claude-check claude-gen-client

# Standard targets shell out to `npm run` — use these in normal terminals and CI.
#
# The `claude-*` variants invoke workspace binaries DIRECTLY (node_modules/.bin,
# hoisted by npm workspaces) to bypass npm's lifecycle-script spawn path, which
# hits EPERM under the Claude Code sandbox. Functionally equivalent to the
# standard targets. `npm install`/`npm ci` still work under the sandbox — only
# `npm run <script>` is affected.
ROOT_BIN := node_modules/.bin

help:
	@grep -E '^[A-Za-z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ──────────────────────────────────────────────────────────────────────────────
# Standard targets (npm) — humans / CI
# ──────────────────────────────────────────────────────────────────────────────

install: ## Install workspace dependencies (generates the single root lockfile)
	npm install

dev: ## Run dev servers (web + api)
	npm run dev

build: ## Build all workspaces
	npm run build

test: ## Run Vitest unit tests (apps/api) with coverage
	npm test

lint: ## Run Biome
	npm run lint

typecheck: ## Run tsc --noEmit across workspaces
	npm run typecheck

check: ## Verification gate: typecheck + lint + test
	npm run check

gen-client: ## Regenerate the OpenAPI client from openapi.yaml
	npm run gen:client

clean: ## Remove build artifacts and node_modules
	rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/*/dist

# ──────────────────────────────────────────────────────────────────────────────
# Claude Code variants — invoke binaries directly (sandbox-safe)
# ──────────────────────────────────────────────────────────────────────────────

claude-install: ## Install deps (sandbox-safe)
	npm install

claude-typecheck: ## tsc --noEmit across workspaces (sandbox-safe)
	$(ROOT_BIN)/tsc --noEmit --project packages/shared/tsconfig.json
	$(ROOT_BIN)/tsc --noEmit --project apps/api/tsconfig.json
	$(ROOT_BIN)/tsc --noEmit --project apps/web/tsconfig.json

claude-lint: ## Biome check (sandbox-safe)
	$(ROOT_BIN)/biome check .

claude-lint-fix: ## Biome check --write (sandbox-safe)
	$(ROOT_BIN)/biome check --write .

claude-test: ## Vitest unit tests + coverage (sandbox-safe)
	cd apps/api && ../../$(ROOT_BIN)/vitest run --coverage

claude-build: ## Build web (sandbox-safe)
	cd apps/web && ../../$(ROOT_BIN)/tsc --noEmit && ../../$(ROOT_BIN)/vite build

claude-check: claude-typecheck claude-lint claude-test ## Verification gate (sandbox-safe)

claude-gen-client: ## Regenerate OpenAPI client (sandbox-safe)
	cd apps/web && ../../$(ROOT_BIN)/openapi-ts -f openapi-ts.config.ts
