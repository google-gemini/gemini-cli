# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gemini CLI is a command-line AI workflow tool that connects to Google's Gemini API, providing AI assistance for software development tasks. The project consists of a monorepo with CLI frontend and core backend packages, plus an extensible tool system for file operations, shell commands, and web interactions.

## Essential Commands

### Development Workflow

```bash
# Full preflight check (build, test, lint, typecheck) - run before submitting changes
npm run preflight

# Development build and start
npm run build
npm start

# Build with sandbox support
npm run build:all

# Testing
npm test                    # Run all unit tests
npm run test:e2e           # Run integration tests
npm run test:ci            # Run tests with coverage

# Code quality
npm run lint               # ESLint check
npm run format             # Prettier formatting
npm run typecheck          # TypeScript type checking

# Single test file
cd packages/cli && npm test -- src/config/sandboxConfig.test.ts
```

### Debugging

```bash
# Debug CLI in VS Code (F5)
npm run debug

# Debug with React DevTools (Ink UI)
DEV=true npm start

# Debug inside sandbox container
DEBUG=1 gemini
```

## Architecture Overview

### Package Structure

- **`packages/cli/`** - Terminal UI frontend using Ink (React for CLI)
  - User input handling, display rendering, themes, configuration
  - React components in `src/ui/components/`
  - Terminal interface with rich text, colors, and interactive elements

- **`packages/core/`** - Backend engine and API integration
  - Gemini API client, prompt construction, conversation management
  - Tool registry and execution system in `src/tools/`
  - State management and configuration

### Key Interaction Flow

1. User input → CLI package captures and processes
2. CLI → Core package (request processing)
3. Core → Gemini API (with tool definitions and context)
4. Gemini response → Tool execution (with user approval for write operations)
5. Tool results → Back to Gemini → Final response to CLI → User display

### Tool System

Tools extend Gemini's capabilities for local environment interaction:

- **File operations**: `read-file`, `write-file`, `edit`, `glob`, `grep`
- **Shell integration**: `shell` (command execution)
- **Web capabilities**: `web-fetch`, `web-search`
- **Memory system**: `memoryTool` for conversation persistence
- **MCP integration**: External tool servers via Model Context Protocol

## Testing Framework & Patterns

### Vitest Configuration

- **Framework**: Vitest with React Testing Library for components
- **Files**: `*.test.ts` for logic, `*.test.tsx` for React components
- **Config**: `vitest.config.ts` in each package
- **UI Testing**: `ink-testing-library` for terminal interface testing

### Critical Testing Patterns

```typescript
// Standard test structure
describe('Module/Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks(); // Essential for test isolation
  });

  // Async testing - use .resolves/.rejects
  it('should handle async operations', async () => {
    await expect(import('./module')).resolves.toBeDefined();
  });
});

// React component testing with Ink
import { render } from 'ink-testing-library';

it('should render component', () => {
  const { lastFrame } = render(<Component {...props} />);
  expect(lastFrame()).toContain('expected text');
});

// Mock ES modules properly
vi.mock('@google/gemini-cli-core', () => ({
  shortenPath: vi.fn((path) => path),
  tokenLimit: vi.fn(() => 10000),
}));
```

### Common Mock Targets

- **Node.js built-ins**: `fs/promises`, `child_process`, `os.homedir()`
- **External APIs**: `@google/genai`, `@modelcontextprotocol/sdk`
- **CLI UI components**: Mock complex Ink components for unit tests
- **Internal packages**: Cross-package dependencies

## Sandbox System

The CLI supports multiple sandboxing approaches for secure tool execution:

### macOS Seatbelt

- Uses `sandbox-exec` with profile-based restrictions
- Profiles: `{permissive,restrictive}-{open,closed,proxied}`
- Configuration via `SEATBELT_PROFILE` environment variable

### Container Sandboxing

- Docker/Podman support via `GEMINI_SANDBOX=true|docker|podman`
- Custom sandbox builds with `.gemini/sandbox.Dockerfile`
- Proxied networking support for controlled external access

## Code Conventions

### TypeScript/JavaScript Patterns

- **Prefer plain objects with TypeScript interfaces over classes**
- **Use ES module imports/exports for encapsulation**
- **Avoid `any` types - prefer `unknown` with type narrowing**
- **Leverage array operators**: `.map()`, `.filter()`, `.reduce()` for functional patterns

### React/Ink UI Guidelines

- **Functional components with hooks only** (no class components)
- **Pure render functions** - side effects in `useEffect` or event handlers
- **Immutable state updates** - never mutate state directly
- **Proper dependency arrays** in effects
- **Minimal `useEffect` usage** - prefer event handlers for user actions

### Import/Export Restrictions

- The project enforces restrictions on relative cross-package imports
- Use proper package imports (`@google/gemini-cli-core`) rather than relative paths between packages

## Configuration Management

### Settings Hierarchy

1. Command-line arguments (highest priority)
2. Environment variables (`GEMINI_*` prefix)
3. `.env` files in project root or user home
4. Settings files in `.gemini/` directory
5. Default values (lowest priority)

### Key Environment Variables

- `GEMINI_API_KEY` - API authentication
- `GEMINI_SANDBOX` - Sandbox configuration
- `GEMINI_SANDBOX_IMAGE` - Custom sandbox image
- `DEV=true` - Development mode with enhanced debugging

## Authentication Patterns

- OAuth2 flow for personal Google accounts (default)
- API key authentication for advanced usage
- Service account support for enterprise environments
- Token caching and refresh handling in core package

## Performance Considerations

- **Large context windows** - 1M+ token support requires efficient context management
- **Tool execution approval** - User confirmation for file system modifications
- **Memory management** - Conversation history and memory imports
- **Streaming responses** - Real-time display of Gemini API responses

## Integration Points

- **MCP servers** - External tool integrations via Model Context Protocol
- **Git integration** - Repository context and history analysis
- **File system operations** - Intelligent file discovery and gitignore handling
- **Web search** - Google Search grounding integration
- **Telemetry** - OpenTelemetry metrics and logging infrastructure
