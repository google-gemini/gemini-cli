# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development Commands
- `npm run build` - Build the entire project
- `npm run build:packages` - Build only the core and CLI packages
- `npm run build:sandbox` - Build the sandbox environment
- `npm run clean` - Clean build artifacts

### Testing Commands
- `npm test` - Run all tests across workspaces
- `npm run test:ci` - Run CI tests with stricter settings
- `npm run test:e2e` - Run end-to-end integration tests
- `npm run test:integration:all` - Run all integration tests (none, docker, podman)
- `npm run test:integration:sandbox:none` - Run integration tests without sandbox

### Code Quality Commands
- `npm run lint` - Run ESLint on TypeScript files
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run lint:ci` - Run ESLint with zero warnings for CI
- `npm run typecheck` - Run TypeScript type checking across workspaces
- `npm run format` - Format code with Prettier
- `npm run preflight` - Complete pre-release check (clean, install, format, lint, build, typecheck, test)

### Development Workflow
- `npm start` - Start the CLI in development mode
- `npm run debug` - Start with Node.js debugger attached
- `npm run bundle` - Generate bundle for distribution

## Architecture

This is a monorepo with a workspace structure containing two main packages:

### Core Package (`packages/core/`)
The foundational layer that provides:
- **Gemini API Client** - Core communication with Gemini models (`core/client.ts`, `core/geminiChat.ts`)
- **Tool System** - Extensible tool registry and execution framework (`tools/`)
  - File operations: read, write, edit, glob, grep
  - Shell command execution
  - MCP (Model Context Protocol) client for external tool servers
  - Web search and fetch capabilities
  - Memory management tools
- **Content Generation** - Request processing and response handling (`core/contentGenerator.ts`)
- **Services** - File discovery, Git integration, telemetry (`services/`)
- **Authentication** - OAuth2 and API key management (`code_assist/`)

### CLI Package (`packages/cli/`)
The user-facing React-based terminal interface:
- **React Terminal UI** - Built with Ink for rich CLI experience (`src/ui/`)
- **Interactive Components** - Input handling, message display, authentication dialogs
- **Theme System** - Multiple color themes for different preferences (`ui/themes/`)
- **Command Processing** - Slash commands, shell integration, at-commands (`ui/hooks/`)
- **Session Management** - History, context, and state management

### Key Integration Points
- **Tool Scheduling** - Coordinates between UI and core tool execution
- **Streaming** - Real-time response handling from Gemini API
- **Memory System** - Persistent context and conversation history
- **Sandbox Integration** - Docker/Podman support for isolated execution
- **MCP Support** - External tool server integration via Model Context Protocol

### Configuration
- **Authentication** - Supports Google OAuth2, API keys, and workspace accounts
- **Settings** - JSON-based configuration with environment variable overrides
- **Sandbox** - Configurable execution environments (none/docker/podman)

The system follows a clean separation where the core package handles all AI and tool logic, while the CLI package focuses on user interface and interaction patterns.