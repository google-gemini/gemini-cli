# Gemini CLI — Agent Instructions

## Build & Test

- **Dependency management:** `npm` workspaces (monorepo)
- **Install:** `npm install` (from repo root)
- **Typecheck:** `npm run typecheck` (must pass zero errors)
- **Lint:** `npm run lint` (must pass zero errors/warnings)
- **Unit tests:** `npm run test` (use `npm run test -- --watch` for watch mode)
- **Build:** `npm run build`

## Code Style

- **License header:** Apache-2.0 (`Copyright 2026 Google LLC` for new files)
- **Quotes:** single quotes for strings
- **Semicolons:** required
- **Import organization:** `type` imports where possible
- **Naming:** camelCase for variables/functions, PascalCase for classes/types
- **Console logs:** use `debugLogger` from `@google/gemini-cli-core`, never raw
  `console.log`

## Project Structure

- `packages/cli/` — CLI UI, auth, settings, terminal interface
- `packages/core/` — business logic, model services, discovery, tool filtering
- `packages/sdk/` — public SDK surface
- `packages/a2a-server/` — A2A server implementation

## Key Conventions

- **Auth types:** `AuthType` enum lives in
  `packages/core/src/core/contentGenerator.ts`. Local backend auth types are
  `USE_LOCAL_*` variants.
- **Local backends:** discovery, resolution, and metadata logic lives in
  `packages/core/src/services/localModelService.ts`,
  `localModelDiscoveryService.ts`, and `localModelMetadata.ts`.
- **Settings:** schema in `packages/cli/src/config/settingsSchema.ts`; runtime
  settings via `useSettings()` hook in CLI.
- **Tests:** Use `vitest`; mock network calls with
  `vi.spyOn(globalThis, 'fetch')`; cleanup mocks in `afterEach`.
- **UI tests:** Use `renderWithProviders` from
  `packages/cli/src/test-utils/render.js`.

## Branches

- Primary feature branch: `feat/add-local-gemma-4-support` (tracks
  `fork/feat/add-local-gemma-4-support`)
- Do not force-push to main/master.
