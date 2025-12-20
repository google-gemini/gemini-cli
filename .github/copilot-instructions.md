# Gemini CLI Copilot Instructions

## Project Overview
Gemini CLI is an open-source AI agent that brings Gemini models directly into the terminal. It's a Node.js monorepo with modular architecture: CLI frontend (`packages/cli`), core backend (`packages/core`), and supporting packages like VS Code integration and MCP servers.

## Architecture
- **CLI Package** (`packages/cli`): User interface, command parsing, display rendering, themes
- **Core Package** (`packages/core`): API client, prompt management, tool execution, state management
- **Tools** (`packages/core/src/tools/`): Built-in capabilities (file ops, shell commands, web search, grep, etc.)
- **MCP Support**: Extensible via Model Context Protocol servers for custom tools
- **Hooks System**: Synchronous event-based customization (BeforeModel, AfterTool, etc.)

## Key Workflows
- **Build**: `npm run build` (compiles packages), `npm run bundle` (creates release executable)
- **Test**: `npm run test` (unit tests), `npm run test:integration:all` (end-to-end with sandboxing)
- **Preflight**: `npm run preflight` (build + test + lint + typecheck)
- **Debug Tracing**: `GEMINI_DEV_TRACING=true npm run telemetry -- --target=genkit` then run CLI

## Project-Specific Patterns
- **Monorepo Management**: Use `npm run <script> --workspaces` for cross-package commands
- **Tool Registration**: Tools extend `BaseTool` class, registered in `packages/core/src/tools/tools.ts`
- **Configuration**: Layered settings (project: `.gemini/settings.json`, user: `~/.gemini/settings.json`)
- **Extensions**: Add MCP servers via `gemini extensions new <name> mcp-server`
- **Hooks**: Command-based scripts in `.gemini/hooks/`, match events like `BeforeTool:WriteFile`
- **Context Files**: `GEMINI.md` provides project-specific instructions to the model
- **Sandboxing**: Integration tests run in Docker/Podman containers for isolation

## Authentication
- OAuth (Google account): Free tier, auto-updates
- API Key: Direct Gemini API access
- Vertex AI: Enterprise features

## Examples
- **Adding a Tool**: Create `packages/core/src/tools/my-tool.ts`, export from `tools.ts`, implement `BaseTool` interface
- **MCP Server**: Use `@modelcontextprotocol/sdk`, register tools with `server.registerTool(name, schema, handler)`
- **Hook Script**: Shell command in `.gemini/hooks/pre-commit.sh`, triggered on `BeforeTool` with regex matcher
- **Extension Manifest**: `gemini-extension.json` with `mcpServers` object defining server commands</content>
<parameter name="filePath">c:\Users\User\Documents\GitHub\gemini-cli\.github\copilot-instructions.md