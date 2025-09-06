# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Building and Testing
- `npm run preflight` - Complete validation: build, test, lint, typecheck, and format
- `npm run build` - Build all packages
- `npm run build:all` - Build main project and sandbox
- `npm run test` - Run tests across all workspaces
- `npm run test:ci` - Run tests with coverage for CI
- `npm run typecheck` - TypeScript type checking across workspaces
- `npm run lint` - ESLint with TypeScript extensions
- `npm run lint:fix` - Auto-fix linting issues
- `npm run format` - Format code with Prettier

### Development
- `npm start` - Start the Gemini CLI
- `npm run debug` - Start in debug mode with Node inspector
- `make create-alias` - Create shell alias for 'gemini' command

### Accelos Package (packages/accelos/)
- `npm run dev` - Start Mastra development server
- `npm run start:dev` - Start with tsx in development mode
- `npm run build:bundle` - Bundle with ncc for production
- `npm run build:binary` - Create platform-specific binaries

## Architecture Overview

### Workspace Structure
This is a monorepo with packages in `packages/`:
- **core** - Core Gemini CLI functionality
- **cli** - Command-line interface implementation
- **accelos** - AI agent using Mastra framework with production review tools
- **vscode-ide-companion** - VS Code extension integration
- **test-utils** - Shared testing utilities

### Accelos AI Agent
The `packages/accelos` directory contains a Mastra-based AI agent with:
- **Agents**: Production review agent, guardrail agent, GitHub workflow debugger
- **Tools**: File analysis, code review, RCA loading, PR workflows, web search, Neo4j EKG storage
- **Workflows**: Code review workflows with streaming support
- **MCP Integration**: GitHub MCP client for repository operations
- **Storage**: Neo4j knowledge graphs, LibSQL memory storage, guardrail management

### Key Technologies
- **TypeScript** with ES modules (`"type": "module"`)
- **React with Ink** for CLI UI components
- **Vitest** for testing
- **ESLint** with TypeScript support
- **Mastra** framework for AI agent orchestration
- **Neo4j** for knowledge graph storage
- **MCP (Model Context Protocol)** for tool integration

## Development Standards

### Code Style
- Use functional components with Hooks (no class components)
- Prefer plain objects with TypeScript interfaces over classes
- Use ES module syntax (`import`/`export`) for encapsulation
- Avoid `any` type; prefer `unknown` for untyped values
- Leverage array operators (`.map()`, `.filter()`, `.reduce()`) for functional programming
- Use hyphens in flag names (`my-flag` not `my_flag`)

### Testing with Vitest
- Tests co-located with source files (`*.test.ts`, `*.test.tsx`)
- Mock ES modules with `vi.mock('module-name', async (importOriginal) => { ... })`
- Use `vi.hoisted()` for mocks that need early definition
- Common mocks: Node.js built-ins (`fs`, `os`, `child_process`), external SDKs (`@google/genai`)
- React component testing uses `ink-testing-library`

### React Guidelines
- Keep components pure during rendering
- Never mutate state directly; use immutable updates
- Use `useEffect` only for synchronization with external systems
- Follow Rules of Hooks (unconditional calls at top level)
- Optimize for concurrent rendering with cleanup functions
- Rely on React Compiler instead of manual `useMemo`/`useCallback`

## Main Branch
The main branch is called "main".