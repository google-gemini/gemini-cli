# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Build System
- `npm run build` - Build the main project
- `npm run build:all` - Build main project, sandbox, and VSCode companion
- `npm run build:packages` - Build all workspace packages
- `npm run bundle` - Generate bundle with assets (generates git commit info first)

### Testing
- `npm run test` - Run tests across all workspaces
- `npm run test:ci` - Run CI tests including scripts tests
- `npm run test:e2e` - Run end-to-end tests (verbose, keeps output)
- `npm run test:integration:all` - Run all integration tests (none, docker, podman)
- `npm run test:scripts` - Run tests for scripts using vitest

### Code Quality
- `npm run lint` - Lint TypeScript and integration tests
- `npm run lint:fix` - Auto-fix linting issues
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Run TypeScript type checking across workspaces
- `npm run preflight` - Complete pre-release check (clean, install, format, lint, build, typecheck, test)

### Development
- `npm run start` - Start the Gemini CLI in development mode
- `npm run debug` - Start CLI with Node.js debugger (--inspect-brk)
- `make start` - Alternative way to start CLI using Makefile
- `make debug` - Alternative debug start using Makefile

### Utilities
- `npm run clean` - Clean generated files and build artifacts
- `npm run generate` - Generate git commit info for bundling

## Architecture Overview

### Monorepo Structure
The Gemini CLI is organized as a TypeScript monorepo with these main packages:

**packages/cli**: User-facing CLI interface
- React-based terminal UI using Ink framework
- Input processing, history management, display rendering
- Theme system and UI customization
- CLI configuration and settings management
- Entry point: `src/gemini.tsx`

**packages/core**: Backend logic and API integration  
- Gemini API client and chat management (`src/core/geminiChat.ts`)
- Tool registration and execution system (`src/tools/`)
- Content generation and prompt construction
- Authentication and session management
- File system tools, shell execution, web search integration

**packages/test-utils**: Shared testing utilities
- File system test helpers
- Common test setup and mocks

**packages/vscode-ide-companion**: VSCode extension
- IDE integration for enhanced developer experience
- File diff management and synchronization

### Key Entry Points
- Main CLI entry: `packages/cli/src/gemini.tsx` (main function)
- Core exports: `packages/core/src/index.ts`
- Bundle entry point: `bundle/gemini.js`

### Tool System Architecture
The CLI extends Gemini's capabilities through a comprehensive tool system:

**File System Tools**: read-file, write-file, ls, glob, grep, edit
**Development Tools**: shell execution, git integration, memory management  
**Web Tools**: web-fetch, web-search for real-time information
**MCP Integration**: Model Context Protocol for extensible tool connections

### Configuration System
- Settings loaded from workspace root using `packages/cli/src/config/settings.ts`
- Support for themes, authentication methods, sandbox configuration
- Extension system for custom functionality

### Build and Bundling
- ESBuild configuration in `esbuild.config.js`
- Bundle generation includes git commit info and asset copying
- Sandbox support with Docker/Podman integration
- VS Code companion built separately

### Testing Strategy
- Unit tests using Vitest across packages
- Integration tests in `integration-tests/` directory
- End-to-end testing with sandbox environments
- Coverage reporting with c8/v8 coverage tools

## Development Workflow

### Making Changes
1. Run `npm run preflight` before submitting changes
2. Use TypeScript throughout - strict mode enabled
3. Follow ESLint configuration (includes React, import rules)
4. Format with Prettier before committing

### Sandbox Development
The CLI supports sandboxed execution environments:
- `npm run build:sandbox` - Build sandbox environment
- Multiple sandbox configurations available in bundle directory
- Integration tests cover sandbox functionality

### Authentication Development
Multiple auth methods supported:
- Google OAuth2 login
- API key authentication  
- Cloud Shell authentication
- Vertex AI authentication

Test authentication flows during development and ensure proper error handling.