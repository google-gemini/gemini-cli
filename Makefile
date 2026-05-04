# Makefile for gemini-cli

.PHONY: help install target-install release-deploy build build-sandbox build-all test lint format preflight clean start debug release run-npx create-alias

help:
	@echo "Makefile for gemini-cli"
	@echo ""
	@echo "Usage:"
	@echo "  make install          - Install npm dependencies"
	@echo "  make target-install   - Copy pre-built bundle to runtime path (NO rebuild — bundle may be stale)"
	@echo "  make build            - Compile TypeScript to dist/ (does NOT produce the deployable bundle)"
	@echo "  make build-all        - Build the main project and sandbox"
	@echo "  make test             - Run the test suite"
	@echo "  make lint             - Lint the code"
	@echo "  make format           - Format the code"
	@echo "  make preflight        - Run formatting, linting, and tests"
	@echo "  make clean            - Remove generated files"
	@echo "  make start            - Start the Gemini CLI"
	@echo "  make debug            - Start the Gemini CLI in debug mode"
	@echo ""
	@echo "  make run-npx          - Run the CLI using npx (for testing the published package)"
	@echo "  make create-alias     - Create a 'gemini' alias for your shell"
	@echo ""
	@echo "  make release-deploy   - FULL RELEASE: bundle + test + deploy + verify version (USE THIS)"

target-install:
	@echo "Installing to stable runtime path: /home/rrs/.local/share/gemini-custom-runtime/"
	@mkdir -p /home/rrs/.local/share/gemini-custom-runtime/
	@# Remove old bundle content to ensure a clean deterministic install
	@rm -rf /home/rrs/.local/share/gemini-custom-runtime/*
	@cp -rv bundle/* /home/rrs/.local/share/gemini-custom-runtime/
	@echo "#!/usr/bin/env bash" > /home/rrs/.local/bin/gemini-custom
	@echo "# Gemini Custom Release: $$(git describe --tags --always)" >> /home/rrs/.local/bin/gemini-custom
	@echo "exec node /home/rrs/.local/share/gemini-custom-runtime/gemini.js \"\$$@\"" >> /home/rrs/.local/bin/gemini-custom
	@chmod +x /home/rrs/.local/bin/gemini-custom
	@echo "Installation complete. Wrapper at ~/.local/bin/gemini-custom"

# Full release pipeline: ALWAYS use this for releases instead of target-install alone.
# Correct sequence: npm run bundle (regenerates git-commit.ts + runs esbuild) -> test -> deploy -> verify.
# WARNING: target-install alone does NOT rebuild — bundle/ may be stale if run after code changes.
release-deploy:
	@echo "=== CAMP Release Pipeline ==="
	@echo "Step 1/4: Bundling (npm run bundle regenerates version info + produces bundle/)..."
	npm run bundle
	@echo "Step 2/4: Running tests..."
	npm run test
	@echo "Step 3/4: Deploying to runtime..."
	$(MAKE) target-install
	@echo "Step 4/4: Verifying deployed version matches package.json..."
	@DEPLOYED=$$(/home/rrs/.local/bin/gemini-custom --version 2>&1); \
	 EXPECTED=$$(node -p "require('./package.json').version"); \
	 if [ "$$DEPLOYED" = "$$EXPECTED" ]; then \
	   echo "VERSION OK: $$DEPLOYED"; \
	 else \
	   echo "VERSION MISMATCH: deployed=$$DEPLOYED expected=$$EXPECTED"; \
	   exit 1; \
	 fi
	@echo "=== Release complete: $$(git describe --tags --always) ==="

install:
	npm install

build:
	npm run build


build-all:
	npm run build:all

test:
	npm run test

lint:
	npm run lint

format:
	npm run format

preflight:
	npm run preflight

clean:
	npm run clean

start:
	npm run start

debug:
	npm run debug


run-npx:
	npx https://github.com/google-gemini/gemini-cli

create-alias:
	scripts/create_alias.sh
