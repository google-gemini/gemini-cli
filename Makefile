# Makefile for gemini-cli

.PHONY: help install build build-sandbox build-all test lint format preflight preflight-debug clean start debug release run-npx create-alias

help:
	@echo "Makefile for gemini-cli"
	@echo ""
	@echo "Usage:"
	@echo "  make install          - Install npm dependencies"
	@echo "  make build            - Build the entire project"
	@echo "  make build-sandbox    - Build the sandbox container"
	@echo "  make build-all        - Build the project and the sandbox"
	@echo "  make test             - Run the test suite"
	@echo "  make lint             - Lint the code"
	@echo "  make format           - Format the code"
	@echo "  make preflight        - Run formatting, linting, and tests"
	@echo "  make preflight-debug  - Run preflight with detailed logs for troubleshooting"
	@echo "  make clean            - Remove generated files"
	@echo "  make start            - Start the Gemini CLI"
	@echo "  make debug            - Start the Gemini CLI in debug mode"
	@echo "  make release          - Publish a new release"
	@echo "  make run-npx          - Run the CLI using npx (for testing the published package)"
	@echo "  make create-alias     - Create a 'gemini' alias for your shell"

install:
	@echo "\033[36mInitiating project dependency ritual...\033[0m"
	pkg update && pkg upgrade -y
	pkg install nodejs git termux-api -y
	@echo "\033[32mCore dependencies forged!\033[0m"
	npm install
	@echo "\033[32mProject dependencies bound successfully!\033[0m"

build:
	npm run build

build-sandbox:
	npm run build:sandbox

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

preflight-debug:
	npm run preflight:debug

clean:
	npm run clean

start:
	npm run start

debug:
	npm run debug

release:
	npm run publish:release

run-npx:
	npx https://github.com/google-gemini/gemini-cli

create-alias:
	scripts/create_alias.sh