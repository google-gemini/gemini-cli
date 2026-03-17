# Gemini CLI Test Utils (`@google/gemini-cli-test-utils`)

Shared test utilities used across the monorepo. This is a private package — not
published to npm.

## Key Modules

- `src/test-rig.ts`: The primary test rig for spinning up end-to-end CLI
  sessions with mock responses.
- `src/file-system-test-helpers.ts`: Helpers for creating temporary file system
  fixtures.
- `src/mock-utils.ts`: Common mock utilities.

## Usage

Import from `@google/gemini-cli-test-utils` in test files across the monorepo.
