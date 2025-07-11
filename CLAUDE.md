# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Gemini CLI Overview

Gemini CLI is a command-line AI workflow tool that connects to Google's Gemini API. It's a TypeScript monorepo with two main packages:
- `packages/cli`: Frontend terminal UI using React + Ink
- `packages/core`: Backend API client and tool system

## Essential Development Commands

```bash
# Install dependencies
npm install

# Build the project
npm run build          # Build all packages
npm run bundle         # Create distribution bundle

# Run tests
npm run test           # Unit tests (Vitest)
npm run test:ci        # Tests with coverage
npm run test:e2e       # Integration tests

# Code quality
npm run lint           # ESLint check
npm run lint:fix       # Auto-fix lint issues
npm run typecheck      # TypeScript type checking
npm run format         # Prettier formatting

# Development
npm run start          # Start Gemini CLI
npm run debug          # Debug mode with inspector

# Full pre-commit check
npm run preflight      # Clean, install, format, lint, build, typecheck, test
```

## Architecture

### Tool System
The project implements an extensible tool architecture in `packages/core/src/tools/`:
- File operations (read, write, edit, search)
- Shell command execution (with optional sandboxing)
- Web operations (fetch, search)
- Memory tools for cross-session state
- MCP server integration

### Key Patterns
1. **Streaming**: Real-time response streaming from Gemini API
2. **React Terminal UI**: Component-based UI in `packages/cli/src/ui/`
3. **Command Processing**: Slash commands, at-commands, and shell integration
4. **Sandbox Security**: Optional Docker/Podman sandboxing for tool execution
5. **Telemetry**: Built-in usage tracking in `packages/core/src/telemetry/`

### Testing Strategy
- Unit tests: Colocated with source files (`*.test.ts`)
- Integration tests: In `/integration-tests/` with custom test runner
- Test sandboxing modes: none, docker, podman

## Important Notes

- **Node.js 18+** required
- Authentication via Google OAuth, API key, or Workspace accounts
- When modifying tools, check `packages/core/src/tools/registry.ts`
- UI components use Ink framework - see `packages/cli/src/ui/`
- Build outputs to `bundle/` for distribution
- Integration with Google Search is built-in to the Gemini API