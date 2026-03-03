# Technology Stack

## Core Technologies

- **Language:** [TypeScript](https://www.typescriptlang.org/) - For type-safe
  application logic and improved developer experience.
- **Runtime:** [Node.js](https://nodejs.org/) (>=20.0.0) - The primary execution
  environment.
- **UI Framework:** [Ink](https://github.com/vadimdemedes/ink) (React-based) -
  For building rich terminal user interfaces.

## Project Structure

- **Monorepo:**
  [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces) - To
  manage multiple packages within a single repository.
  - `packages/cli`: User-facing CLI application.
  - `packages/core`: Core logic and tool orchestration.
  - `packages/devtools`: Integrated developer tools.
  - `packages/vscode-ide-companion`: VS Code extension.

## Development & Build Tools

- **Bundler:** [esbuild](https://esbuild.github.io/) - For fast building and
  bundling of packages.
- **Test Runner:** [Vitest](https://vitest.dev/) - For unit and integration
  testing.
- **Linting & Formatting:** [ESLint](https://eslint.org/) and
  [Prettier](https://prettier.io/) - To maintain code quality and consistent
  style.
- **Git Hooks:** [Husky](https://typicode.github.io/husky/) - To enforce quality
  checks before commits.

## Key Libraries

- **Model Interaction:** Gemini API (orchestrated in `packages/core`).
- **Tool Support:**
  [Agent Client Protocol (ACP)](https://github.com/agent-client-protocol/acp)
  and [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).
- **Utilities:** `yargs` (argument parsing), `simple-git` (git operations),
  `node-fetch-native` (web fetching).
