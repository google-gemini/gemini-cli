# NPM Scripts Reference

This document lists all npm scripts available in the Gemini CLI project, read directly from `package.json`.

## Build & Development

- **`generate`**: `node scripts/generate-git-commit-info.js`
  - Generates git commit information.
- **`build`**: `node scripts/build.js`
  - Builds the entire project.
- **`build:packages`**: `npm run build --workspaces`
  - Builds all packages in the workspaces.
- **`clean`**: `node scripts/clean.js`
  - Removes generated files and build artifacts.
- **`prepare`**: `npm run bundle`
  - A lifecycle script that runs the `bundle` script.
- **`bundle`**: `npm run generate && node esbuild.config.js && node scripts/copy_bundle_assets.js`
  - Creates the final application bundle for distribution.
- **`start`**: `node scripts/start.js`
  - Starts the CLI in development mode with hot-reloading.
- **`debug`**: `cross-env DEBUG=1 node --inspect-brk scripts/start.js`
  - Starts the CLI in debug mode with the Node.js inspector.
- **`dev:sandbox`**: `docker run ...`
  - Runs the CLI inside a Docker container for development and testing in a sandboxed environment.

## Testing

- **`test`**: `npm run test --workspaces`
  - Runs the unit and integration tests for all workspaces.
- **`test:ci`**: `npm run test:ci --workspaces --if-present && npm run test:scripts`
  - Runs all tests required for the Continuous Integration pipeline.
- **`test:e2e`**: `npm run test:integration:sandbox:none -- --verbose --keep-output`
  - A shortcut to run end-to-end integration tests without a sandbox, with verbose output.
- **`test:integration:all`**: `npm run test:integration:sandbox:none && npm run test:integration:sandbox:docker && npm run test:integration:sandbox:podman`
  - Runs the full suite of integration tests across all sandbox environments.
- **`test:integration:sandbox:none`**: `GEMINI_SANDBOX=false node integration-tests/run-tests.js`
  - Runs integration tests with sandboxing disabled.
- **`test:integration:sandbox:docker`**: `GEMINI_SANDBOX=docker node integration-tests/run-tests.js`
  - Runs integration tests using the Docker sandbox.
- **`test:integration:sandbox:podman`**: `GEMINI_SANDBOX=podman node integration-tests/run-tests.js`
  - Runs integration tests using the Podman sandbox.
- **`test:scripts`**: `vitest run --config ./scripts/tests/vitest.config.ts`
  - Runs tests specifically for the `scripts/` directory.

## Code Quality

- **`lint`**: `eslint . --ext .ts,.tsx && eslint integration-tests`
  - Lints all TypeScript/TSX files in the project.
- **`lint:fix`**: `eslint . --fix && eslint integration-tests --fix`
  - Automatically fixes linting errors.
- **`lint:ci`**: `eslint . --ext .ts,.tsx --max-warnings 0 && eslint integration-tests --max-warnings 0`
  - A stricter version of the linter for CI that fails on any warnings.
- **`typecheck`**: `npm run typecheck --workspaces --if-present`
  - Runs TypeScript type checking across all workspaces.
- **`format`**: `prettier --write .`
  - Formats all code in the project using Prettier.
- **`preflight`**: `npm run clean && npm ci && npm run format && npm run lint:ci && npm run build && npm run typecheck && npm run test:ci`
  - Runs a comprehensive suite of checks to ensure code quality before submission.

## Release & Publishing

- **`prepare:package`**: `node scripts/prepare-package.js`
  - Prepares the packages for publishing to npm.
- **`release:version`**: `node scripts/version.js`
  - Updates the package versions for a new release.
