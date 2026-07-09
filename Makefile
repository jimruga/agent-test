.PHONY: help install dev build test lint typecheck check test-e2e storybook gen-client clean \
	claude-install claude-build claude-test claude-test-browser claude-test-browser-quiet claude-test-all \
	claude-lint claude-lint-fix claude-typecheck claude-check claude-test-e2e \
	claude-storybook claude-gen-client claude-routes

## TODO NOTE: Edit this file to reference commands directly without the npm path when 
## not using a sandbox.

# Standard targets shell out to npm — use these in normal terminals and CI.
#
# The `claude-*` variants invoke binaries directly to bypass npm's
# lifecycle-script spawn path, which hits EPERM under the Claude Code sandbox.
# See claude-feature-notes/ for context. `npm install`, `npm dev`, and
# `npm exec` still work — only `npm run <script>` (and turbo, which shells
# out to it) are affected.
WEB_BIN     := apps/web/node_modules/.bin
SHARED_BIN  := packages/shared/node_modules/.bin
ROOT_BIN    := node_modules/.bin

help:
	@grep -E '^[A-Za-z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ──────────────────────────────────────────────────────────────────────────────
# Standard targets (npm)
# ──────────────────────────────────────────────────────────────────────────────

install: ## Install dependencies and Playwright browsers
	npm install
	npm --filter @repo/web exec playwright install

dev: ## Run dev servers (web + api)
	npm dev

build: ## Build all workspaces
	npm build

test: ## Run Vitest unit tests
	npm test

lint: ## Run Biome
	npm lint

typecheck: ## Run tsc --noEmit across workspaces
	npm typecheck

check: ## Verification gate: typecheck + lint + test + build
	npm check

test-e2e: ## Run Playwright e2e tests
	npm test:e2e

storybook: ## Run Storybook dev server
	npm storybook

gen-client: ## Regenerate OpenAPI client from openapi.yaml
	npm gen:client

clean: ## Remove build artifacts and node_modules
	rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/*/dist

# ──────────────────────────────────────────────────────────────────────────────
# Claude Code variants — invoke binaries directly to bypass npm spawn EPERM
# under the sandbox. Functionally equivalent to the standard targets above.
# ──────────────────────────────────────────────────────────────────────────────

claude-install: ## Install deps + Playwright (sandbox-safe)
	npm install
	cd apps/web && node_modules/.bin/playwright install

claude-build: ## Build web (sandbox-safe)
	cd apps/web && node_modules/.bin/tsc --build tsconfig.client.json && node_modules/.bin/tsc --noEmit && node_modules/.bin/vite build

claude-test: ## Vitest unit tests (sandbox-safe)
	cd apps/web && node_modules/.bin/vitest run --project unit

claude-test-browser: ## Vitest browser-mode tests (sandbox-safe)
	cd apps/web && node_modules/.bin/vitest run --project browser

claude-test-browser-quiet: ## Vitest browser-mode tests, low-noise output (sandbox-safe)
	cd apps/web && VITE_TL_QUIET=1 node_modules/.bin/vitest run --project browser --silent --reporter=dot

claude-test-all: ## All Vitest projects (sandbox-safe)
	cd apps/web && node_modules/.bin/vitest run

claude-lint: ## Biome check (sandbox-safe)
	$(ROOT_BIN)/biome check .

claude-lint-fix: ## Biome check --write (sandbox-safe)
	$(ROOT_BIN)/biome check --write .

claude-typecheck: ## tsc --noEmit across workspaces (sandbox-safe)
	cd apps/web && node_modules/.bin/tsc --build tsconfig.client.json && node_modules/.bin/tsc --noEmit
	cd packages/shared && node_modules/.bin/tsc --noEmit

claude-check: claude-typecheck claude-lint claude-test claude-build ## Verification gate (sandbox-safe)

claude-test-e2e: ## Playwright e2e tests (sandbox-safe)
	cd apps/web && node_modules/.bin/playwright test

claude-storybook: ## Storybook dev server (sandbox-safe)
	cd apps/web && node_modules/.bin/storybook dev -p 6006

claude-gen-client: ## Regenerate OpenAPI client (sandbox-safe)
	cd apps/web && node_modules/.bin/openapi-ts -f openapi-ts.config.ts && node_modules/.bin/tsc --build tsconfig.client.json

claude-routes: ## Regenerate TanStack Router route tree (sandbox-safe)
	cd apps/web && node_modules/.bin/tsr generate
