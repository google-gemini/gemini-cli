# Gemini CLI Project Context

Gemini CLI is an open-source AI agent that brings the power of Gemini directly
into the terminal. It is designed to be a terminal-first, extensible, and
powerful tool for developers.

## Project Overview

- **Purpose:** Provide a seamless terminal interface for Gemini models,
  supporting code understanding, generation, automation, and integration via MCP
  (Model Context Protocol).
- **Main Technologies:**
  - **Runtime:** Node.js (>=20.0.0, recommended ~20.19.0 for development)
  - **Language:** TypeScript
  - **UI Framework:** React (using [Ink](https://github.com/vadimdemedes/ink)
    for CLI rendering)
  - **Testing:** Vitest
  - **Bundling:** esbuild
  - **Linting/Formatting:** ESLint, Prettier
- **Architecture:** Monorepo structure using npm workspaces.
  - `packages/cli`: User-facing terminal UI, input processing, and display
    rendering.
  - `packages/core`: Backend logic, Gemini API orchestration, prompt
    construction, and tool execution.
  - `packages/core/src/tools/`: Built-in tools for file system, shell, and web
    operations.
  - `packages/a2a-server`: Experimental Agent-to-Agent server.
  - `packages/vscode-ide-companion`: VS Code extension pairing with the CLI.

## Building and Running

- **Install Dependencies:** `npm install`
- **Build All:** `npm run build:all` (Builds packages, sandbox, and VS Code
  companion)
- **Build Packages:** `npm run build`
- **Run in Development:** `npm run start`
- **Run in Debug Mode:** `npm run debug` (Enables Node.js inspector)
- **Bundle Project:** `npm run bundle`
- **Clean Artifacts:** `npm run clean`

## Testing and Quality

- **Test Commands:**
  - **Unit (All):** `npm run test`
  - **Integration (E2E):** `npm run test:e2e`
  - **Workspace-Specific:** `npm test -w <pkg> -- <path>` (Note: `<path>` must
    be relative to the workspace root, e.g.,
    `-w @google/gemini-cli-core -- src/routing/modelRouterService.test.ts`)
- **Full Validation:** `npm run preflight` (Heaviest check; runs clean, install,
  build, lint, type check, and tests. Recommended before submitting PRs.)
- **Individual Checks:** `npm run lint` / `npm run format` / `npm run typecheck`

## Development Conventions

- **Contributions:** Follow the process outlined in `CONTRIBUTING.md`. Requires
  signing the Google CLA.
- **Pull Requests:** Keep PRs small, focused, and linked to an existing issue.
- **Commit Messages:** Follow the
  [Conventional Commits](https://www.conventionalcommits.org/) standard.
- **Coding Style:** Adhere to existing patterns in `packages/cli` (React/Ink)
  and `packages/core` (Backend logic).
- **Imports:** Use specific imports and avoid restricted relative imports
  between packages (enforced by ESLint).

## Testing Conventions

- **Environment Variables:** When testing code that depends on environment
  variables, use `vi.stubEnv('NAME', 'value')` in `beforeEach` and
  `vi.unstubAllEnvs()` in `afterEach`. Avoid modifying `process.env` directly as
  it can lead to test leakage and is less reliable. To "unset" a variable, use
  an empty string `vi.stubEnv('NAME', '')`.

## Internationalization (i18n)

All user-facing strings in `packages/cli` must be translatable. Never hardcode
English text in UI components.

- **In React components:** Use the `useTranslation` hook from `react-i18next`:

  ```tsx
  import { useTranslation } from 'react-i18next';
  const { t } = useTranslation('common');
  return <Text>{t('greeting')}</Text>;
  ```

- **Outside React:** Import `t` from `packages/cli/src/i18n/index.ts`:

  ```typescript
  import { t } from '../i18n/index.js';
  const msg = t('common:loading');
  ```

- **Adding new strings:** Add the English key to the appropriate namespace file
  in `packages/cli/src/i18n/locales/en/` (`common.json`, `commands.json`,
  `dialogs.json`, `help.json`, or `loading.json`), then add the corresponding
  translation to all other locale folders (currently `ja/`).
- **Interpolation:** Use i18next syntax `{{variable}}` for dynamic values, never
  string concatenation.
- **Semantic completeness:** Each translation key should be a complete,
  meaningful sentence or phrase. Do not split sentences across multiple keys.
- **Locale packs:** Each locale folder contains a `manifest.json` declaring its
  `displayName`. New languages are added by creating a folder — no code changes
  needed. See `docs/cli/internationalization.md` for the full guide.

## Documentation

- Always use the `docs-writer` skill when you are asked to write, edit, or
  review any documentation.
- Documentation is located in the `docs/` directory.
- Suggest documentation updates when code changes render existing documentation
  obsolete or incomplete.
