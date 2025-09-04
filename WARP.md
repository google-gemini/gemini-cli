# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Common Development Commands

### Essential Commands

```bash
# Install dependencies
npm install

# Build entire project (includes all packages)
npm run build

# Build all packages and sandbox container
npm run build:all

# Start Gemini CLI from source
npm start

# Debug mode with inspector
npm run debug

# Run all tests (unit tests for all packages)
npm run test

# Run integration tests
npm run test:e2e

# Lint code
npm run lint

# Format code with Prettier
npm run format

# Type checking
npm run typecheck

# Full preflight check (build, lint, format, test, typecheck)
npm run preflight
```

### Individual Package Commands

```bash
# Build specific package
npm run build --workspaces

# Test specific package
npm run test --workspaces --if-present

# Work with CLI package specifically
cd packages/cli && npm run build
cd packages/core && npm run build
```

### Testing Commands

```bash
# Unit tests only
npm run test

# Integration tests with different sandbox modes
npm run test:integration:sandbox:none
npm run test:integration:sandbox:docker
npm run test:integration:sandbox:podman

# All integration tests
npm run test:integration:all

# End-to-end tests (verbose with output kept)
npm run test:e2e
```

## High-Level Architecture

### Package Structure

The codebase follows a **monorepo workspace architecture** with clear separation between frontend and backend:

**Core Architecture Pattern:**

- `packages/cli/` - **Frontend CLI Interface** (React-based using Ink framework)
- `packages/core/` - **Backend Engine** (API communication, tool orchestration, prompt management)
- **Tool System** - Extensible architecture for LLM capabilities

### Main Flow

1. **User Input** → CLI package processes terminal input
2. **Request Processing** → CLI sends to Core package
3. **API Communication** → Core constructs prompts, sends to Gemini API
4. **Tool Orchestration** → Core interprets tool requests from API response
5. **Tool Execution** → Core executes tools (with user confirmation for destructive ops)
6. **Response Display** → CLI formats and displays final response

### Key Architectural Components

**Tool System (`packages/core/src/tools/`):**

- **BaseTool** class defining tool interface (name, schema, validation, execution)
- **ToolRegistry** for tool discovery and management
- **Built-in Tools**: File operations, shell commands, web fetch, memory, grep, glob
- **MCP Integration** for custom tool servers
- **Security Model**: User confirmation for destructive operations, sandboxing support

**Core Services:**

- **API Client** - Google Gemini API communication with auth handling
- **Prompt Engineering** - Context construction with conversation history
- **Memory Management** - GEMINI.md file discovery and processing
- **Session State** - Conversation and context management
- **File Discovery** - Project file indexing and relevance matching

**CLI Layer:**

- **React/Ink UI** - Terminal-based React components
- **Command Processing** - Slash commands (`/help`, `/chat`, `/mcp`, etc.)
- **History Management** - Conversation persistence
- **Theme System** - Visual customization
- **Configuration** - Settings and authentication management

### Authentication Modes

- **OAuth** - Google account login (recommended)
- **API Key** - Direct Gemini API key
- **Vertex AI** - Enterprise Google Cloud integration

### Extension Points

- **MCP Servers** - Model Context Protocol for custom tools
- **Tool Discovery** - Command-based or MCP-based tool registration
- **Configuration** - JSON-based settings in `~/.gemini/settings.json`
- **Memory Files** - Project-specific context via GEMINI.md files

### Sandboxing Architecture

- **macOS Seatbelt** - Built-in sandbox profiles (permissive/restrictive)
- **Container-based** - Docker/Podman isolation
- **Proxy Support** - Network traffic filtering through custom proxies

### Development Workflow

- **TypeScript** throughout with strict typing
- **ESM modules** (Node.js 20+ required for development)
- **Monorepo** with npm workspaces
- **Build System** - Custom build scripts with esbuild bundling
- **Testing** - Vitest for unit tests, custom integration test framework
- **CI/CD** - GitHub Actions with automated checks and releases

### Key Files for Understanding

- `packages/core/src/core/prompts.ts` - System prompt definitions
- `packages/core/src/tools/` - All built-in tool implementations
- `docs/architecture.md` - Detailed architectural overview
- `docs/tools/index.md` - Comprehensive tool system documentation
- `CONTRIBUTING.md` - Development setup and contribution guidelines

## Development Notes

**Prerequisites:**

- Node.js ~20.19.0 for development (>=20 for production)
- Git

**Debugging:**

- VS Code: Use F5 or "Launch Program" configuration
- React DevTools: `DEV=true npm start` + react-devtools@4.28.5
- Sandbox debugging: `DEBUG=1 gemini`

**Important Build Patterns:**

- Always run `npm run preflight` before committing
- Use `npm run build:all` when working on sandbox features
- The project bundles to `bundle/` directory for distribution
- Package builds use custom scripts in `scripts/` directory
