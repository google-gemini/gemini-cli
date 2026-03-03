# Technology Stack

## Core Technologies

- **Language:** TypeScript (Primary language for all packages)
- **Runtime:** Node.js (>= 20.0.0)
- **UI Framework:** React with [Ink](https://github.com/vadimdemedes/ink) for
  CLI rendering

## Development \u0026 Build Tooling

- **Package Manager:** npm (Monorepo with workspaces)
- **Bundler:** esbuild
- **Test Runner:** Vitest
- **Static Analysis:** ESLint
- **Code Formatting:** Prettier
- **Git Hooks:** Husky \u0026 lint-staged

## Architecture

- **Structure:** Monorepo
- **Workspaces:**
  - `packages/cli`: User-facing terminal UI
  - `packages/core`: Core logic and tool execution
  - `packages/devtools`: Integrated developer tools
  - `packages/sdk`: Client SDK
  - `packages/vscode-ide-companion`: VS Code extension
- **Integration:** MCP (Model Context Protocol) for tool extensibility
