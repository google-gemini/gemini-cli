# Plan - Fix Subcommand Shadowing and TypeError in Config

## Objective

Address the issues reported in PR 23177:

1. Fix yargs subcommand shadowing in `packages/cli/src/config/config.ts`.
   (Already implemented, needs verification)
2. Fix `TypeError: Cannot read properties of undefined (reading 'admin')` in
   `packages/cli/src/config/extension-manager.ts` and
   `packages/cli/src/config/config.ts`.
3. Verify that auth is correctly skipped for management commands.

## Key Files & Context

- `packages/cli/src/config/config.ts`: Subcommand registration and
  `settings.admin` access.
- `packages/cli/src/config/extension-manager.ts`: Unprotected `settings.admin`
  access causing `TypeError`.
- `packages/cli/src/gemini.tsx`: Logic to skip auth for commands.

## Implementation Steps

### 1. Fix `TypeError`

- Add optional chaining to all `settings.admin` accesses in
  `packages/cli/src/config/extension-manager.ts`.
- Audit `packages/cli/src/config/config.ts` for any other unprotected
  `settings.admin` or similar accesses.

### 2. Verify Subcommand Shadowing Fix

- Ensure that subcommands like `mcp`, `extensions`, `skills`, `hooks` are
  registered BEFORE the default `$0` command.
- Verify that the `isCommand` middleware correctly identifies these subcommands.

### 3. Verification & Testing

- Run unit tests: `npm test -w @google/gemini-cli -- src/config/config.test.ts`
- Run integration tests: `npm run test:e2e`
- Specifically verify the cases that were failing in E2E tests.

## Migration & Rollback

- These changes are internal fixes and don't require migration steps.
- Rollback can be done by reverting the commits.
