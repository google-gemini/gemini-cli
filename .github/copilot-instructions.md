# Gemini CLI: AI Coding Agent Instructions

This guide enables AI coding agents to be productive in the Gemini CLI codebase. It summarizes architecture, workflows, conventions, and integration points unique to this project.

## Architecture Overview
- **CLI Frontend (`packages/cli`)**: Handles user input, output rendering, history, themes, and configuration. Entry for terminal interactions.
- **Core Backend (`packages/core`)**: Orchestrates Gemini API calls, prompt construction, tool execution, and session state. All tool invocations and model interactions flow through here.
- **Tools (`packages/core/src/tools/`)**: Modular extensions for file system, shell, web, and other capabilities. Tools are invoked by the core based on model requests.
- **Extensions (`extensions/`)**: Add new commands/tools via MCP (Model Context Protocol) servers. See `docs/getting-started-extensions.md` for extension authoring.

## Developer Workflows
- **Build**: Use `npm run build` (root) or `npm run build -w <package>` for individual packages. See `scripts/` for build logic.
- **Test**: Run unit tests with `npm test`. Integration tests (end-to-end) are in `integration-tests/` and run via `npm run test:e2e` or `npm run test:integration:all`.
- **Debug**: Most debugging is done via CLI output. For extension debugging, see VS Code integration in `packages/vscode-ide-companion`.
- **Release**: Preview, stable, and nightly releases are managed via npm tags. See `docs/releases.md` for cadence and details.

## Project Conventions
- **Issue/PR Automation**: Every PR should link to an Issue. Automated triage applies area/kind/priority labels. See `.github/workflows/gemini-automated-issue-triage.yml` and `docs/issue-and-pr-automation.md`.
- **ESM Only**: All packages use ES Modules (`type: module` in `package.json`, `module: NodeNext` in `tsconfig.json`).
- **Explicit Tool Approval**: Tools that modify the environment (e.g., write files, run shell) require user confirmation before execution.
- **Extensibility**: New tools/extensions should register with the core and follow the MCP protocol for context and command definition.

## Integration Points
- **Gemini API**: All model interactions are routed via `packages/core`.
- **VS Code Extension**: `packages/vscode-ide-companion` enables editor context, selection, and diffing for CLI sessions.
- **MCP Extensions**: Custom tools/commands are added via MCP servers. See `docs/getting-started-extensions.md` and example extensions in `extensions/`.

## Key Files & Directories
- `packages/cli/` – CLI entrypoint and user experience
- `packages/core/` – Backend logic, tool orchestration
- `packages/core/src/tools/` – Built-in tools
- `extensions/` – Extension examples and templates
- `integration-tests/` – End-to-end test suite
- `scripts/` – Build, release, and utility scripts
- `docs/` – Architecture, FAQ, extension guides, automation

## Example Patterns
- **Tool Registration**: See `packages/core/src/tools/` for how tools are defined and registered.
- **Extension Manifest**: Example in `extensions/hello/gemini-extension.json`.
- **Integration Test**: Example in `integration-tests/list_directory.test.ts`.

---
For unclear or incomplete sections, please provide feedback to improve these instructions.