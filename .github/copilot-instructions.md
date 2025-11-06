# Gemini CLI Copilot Instructions

## Project Architecture

Gemini CLI is a TypeScript monorepo with a clear separation between frontend and backend:

- **`packages/cli`**: React-based terminal UI using Ink framework, handles user interaction and display
- **`packages/core`**: Core engine that manages Gemini API communication, tool execution, and state
- **`packages/vscode-ide-companion`**: VS Code extension for IDE integration
- **`packages/a2a-server`**: Agent-to-agent communication server
- **`packages/test-utils`**: Shared testing utilities

## Key Development Patterns

### Tool System (`packages/core/src/tools/`)
Tools are modular capabilities that extend Gemini's abilities. Each tool follows this pattern:
- Implements `BaseTool` interface with `build()` and `invoke()` methods
- Uses confirmation system for destructive operations via `MessageBus`
- Registration handled by `tool-registry.ts` 
- MCP integration through `mcp-client.ts` and `mcp-tool.ts`

### Build System
- **Development**: `npm run start` (builds and starts with file watching)
- **Production**: `npm run build` followed by `npm run bundle` (creates single executable)
- **Testing**: Integration tests in `integration-tests/` with sandbox support
- **Sandboxing**: Docker/Podman containers for safe shell execution (`GEMINI_SANDBOX` env var)

### Extension System
Extensions live in directories with `gemini-extension.json` manifests:
- Custom commands in `.toml` format under `commands/` subdirectories
- Project-local extensions (`.gemini/`) override global ones (`~/.gemini/`)
- MCP servers configured in `settings.json` under `mcpServers`

## Critical Workflows

### Local Development Setup
```bash
npm install
npm run build        # Build all packages
npm run start        # Start with file watching
npm run preflight    # Full CI check (lint, test, build)
```

### Testing Strategy
- Unit tests alongside source files (`.test.ts`)
- Integration tests in `integration-tests/` with Vitest (5min timeout)
- Sandbox variants: `test:integration:sandbox:none|docker|podman`
- E2E tests with response snapshots (`.responses` files)

### Release Process
- Nightly builds: Daily at UTC 0000 (`@nightly` tag)
- Preview releases: Weekly Tuesday UTC 2359 (`@preview` tag)  
- Stable releases: Weekly Tuesday UTC 2000 (`@latest` tag)
- Version managed via `scripts/version.js` (updates sandbox image URIs)

## Project Conventions

### Code Style
- ESLint + Prettier with Apache 2.0 license headers required
- React components use Ink framework patterns
- Zod schemas for configuration validation
- File paths always absolute in tool operations

### Testing Patterns
- Response snapshots for integration tests (regenerate with `UPDATE_SNAPSHOTS=1`)
- Mock external services with MSW
- Deflake utility for flaky tests: `npm run deflake`
- Parallel execution with retry logic (2 retries default)

### Configuration Management
- Settings schema generated from TypeScript: `scripts/generate-settings-schema.ts`
- TOML format for custom commands and project configuration
- JSON format for global settings (`~/.gemini/settings.json`)

## IDE Integration Points

### VS Code Companion (`packages/vscode-ide-companion`)
- Provides editor context (open files, selections, cursor position)
- Native diff view integration for code changes
- Launched via Command Palette: "Gemini CLI: Run"

### Development Commands
- `/extensions list`: Show installed extensions
- `/help`: Available slash commands
- `/bug`: Report issues with diagnostic info
- Custom commands: Namespaced with colons (e.g., `/git:commit`)

Remember: This is an AI agent CLI that bridges terminal workflows with LLM capabilities through a robust tool system and extension architecture.