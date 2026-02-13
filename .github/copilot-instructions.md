# Gemini CLI: AI Coding Agent Instructions

This guide enables AI coding agents to be productive in the Gemini CLI codebase.
It summarizes architecture, workflows, conventions, and integration points
unique to this project.

## Specialized Agent Personas

For focused expertise, refer to these specialized agent instructions in
`.github/agents/`:

- **[docs-agent.md](./agents/docs-agent.md)**: Documentation writing and
  maintenance
- **[test-agent.md](./agents/test-agent.md)**: Unit and integration testing
- **[frontend-agent.md](./agents/frontend-agent.md)**: CLI/React (Ink) UI
  development
- **[core-agent.md](./agents/core-agent.md)**: Backend, tools, and API
  integration

## Architecture Overview

- **CLI Frontend (`packages/cli`)**: Handles user input, output rendering,
  history, themes, and configuration. Entry for terminal interactions.
- **Core Backend (`packages/core`)**: Orchestrates Gemini API calls, prompt
  construction, tool execution, and session state. All tool invocations and
  model interactions flow through here.
- **Tools (`packages/core/src/tools/`)**: Modular extensions for file system,
  shell, web, and other capabilities. Tools are invoked by the core based on
  model requests.
- **Extensions (`extensions/`)**: Add new commands/tools via MCP (Model Context
  Protocol) servers. See `docs/getting-started-extensions.md` for extension
  authoring.

## Developer Workflows

### Essential Commands

```bash
# Development
npm start                              # Start CLI in development mode
npm run build                          # Build all packages
npm run build:all                      # Build packages + sandbox + VS Code extension

# Quality Checks
npm run preflight                      # Run ALL checks (format, lint, build, test)
npm run test                           # Run unit tests
npm run test:integration:sandbox:none  # Run integration tests (no sandbox)
npm run lint                           # Run linter
npm run format                         # Format code with Prettier

# Debugging
DEBUG=1 npm start                      # Start with debug mode
DEV=true npm start                     # Start with React DevTools support
```

### Before Every PR

**Always run** `npm run preflight` before submitting. This runs:

- Prettier formatting
- ESLint linting
- TypeScript compilation
- All unit tests
- Additional validation checks

### Testing Strategy

- **Unit Tests**: Co-located with source files (`*.test.ts`, `*.test.tsx`)
- **Integration Tests**: In `integration-tests/` directory
- **Test Framework**: Vitest with React Testing Library for Ink components
- **Run specific tests**: `npm run test -- path/to/file.test.ts`

## Project Conventions

### Code Style & Standards

- **Language**: TypeScript with strict mode enabled
- **Module System**: ES Modules only (`"type": "module"`)
  - Always use `.js` extension in imports: `import { x } from './file.js'`
  - Never use relative imports between packages
- **License Headers**: All source files must include Apache 2.0 license header
- **Formatting**: Prettier (enforced via pre-commit hooks)
- **Linting**: ESLint with project-specific rules
- **Commit Messages**: Follow
  [Conventional Commits](https://www.conventionalcommits.org/)

### Architecture Principles

- **Monorepo**: 5 workspaces in `packages/` directory
- **Tool Approval**: Tools that modify environment require user confirmation
- **Sandbox First**: Use sandboxing for shell execution when available
- **MCP Integration**: Custom tools/commands via Model Context Protocol servers

### Important Patterns

- **Diff Operations**: Always use `DEFAULT_DIFF_OPTIONS` from
  `packages/core/src/tools/diffOptions.ts`
- **Error Handling**: Return structured errors, never throw in tool handlers
- **Async/Await**: Use consistently, avoid callbacks
- **React Patterns**: Functional components with hooks (no class components)

### Pull Request Guidelines

- **Link to Issue**: Every PR must reference an existing issue
- **Keep PRs Small**: Focus on single feature or bug fix
- **Run Preflight**: Always run `npm run preflight` before submitting
- **Update Docs**: Include documentation changes for user-facing features
- **Automated Labels**: Triage system applies area/kind/priority labels
  automatically

## Integration Points

- **Gemini API**: All model interactions are routed via `packages/core`.
- **VS Code Extension**: `packages/vscode-ide-companion` enables editor context,
  selection, and diffing for CLI sessions.
- **MCP Extensions**: Custom tools/commands are added via MCP servers. See
  `docs/getting-started-extensions.md` and example extensions in `extensions/`.

## Key Files & Directories

### Source Code (Modify These)

```
packages/
├── cli/                      # CLI frontend (React/Ink UI)
│   └── src/
│       ├── components/       # React components
│       ├── hooks/           # Custom React hooks
│       └── utils/           # CLI utilities
├── core/                     # Backend logic
│   └── src/
│       ├── tools/           # Built-in tools (file, shell, web)
│       ├── gemini/          # Gemini API integration
│       ├── session/         # Session state management
│       └── mcp/             # MCP server integration
├── test-utils/              # Shared test utilities
├── a2a-server/              # Agent-to-agent server (experimental)
└── vscode-ide-companion/    # VS Code extension
```

### Supporting Files

```
docs/                        # Documentation (update when changing features)
integration-tests/           # End-to-end tests
scripts/                     # Build, release, utility scripts
.github/
├── workflows/              # CI/CD workflows
├── agents/                 # Specialized agent instructions
└── copilot-instructions.md # This file
```

### Generated/Build Output (Don't Modify)

- `packages/*/dist/` - TypeScript compilation output
- `bundle/` - Bundled distribution files
- `node_modules/` - Dependencies
- `packages/*/src/generated/` - Auto-generated code

## Technology Stack

### Core Dependencies

- **Runtime**: Node.js >=20.0.0 (development: ~20.19.0)
- **AI/LLM**: `@google/genai@1.30.0` (Gemini API)
- **MCP**: `@modelcontextprotocol/sdk` (extensions)
- **CLI Framework**: Ink (React for CLIs)
- **Testing**: Vitest + React Testing Library
- **Build**: esbuild for bundling

### Key Libraries

- **File Operations**: ripgrep (via grep), glob patterns
- **Diff/Patch**: `diff` package with `DEFAULT_DIFF_OPTIONS`
- **Terminal UI**: Ink, chalk (colors), prompts
- **Process Management**: Node.js child_process

## Example Patterns

### Tool Registration

```typescript
// packages/core/src/tools/my-tool.ts
export const myTool: Tool = {
  name: 'my_tool',
  description: 'Tool description',
  parameters: { /* JSON schema */ },
  requiresApproval: true,
  handler: async (params, context) => {
    // Implementation
    return { success: true, data: result };
  },
};

// Register in packages/core/src/tools/index.ts
export const allTools = [..., myTool];
```

### React Component (Ink)

```typescript
import React, { FC } from 'react';
import { Box, Text } from 'ink';

export const MyComponent: FC<{ message: string }> = ({ message }) => (
  <Box flexDirection="column">
    <Text>{message}</Text>
  </Box>
);
```

### Unit Test

```typescript
import { describe, it, expect } from 'vitest';

describe('myFunction', () => {
  it('should handle valid input', () => {
    expect(myFunction('input')).toBe('output');
  });
});
```

### Integration Test

See `integration-tests/list_directory.test.ts` for complete example.

## Security Considerations

### Tool Execution

- All tools that modify state **must** set `requiresApproval: true`
- Validate all user input before execution
- Use sandboxing for shell commands
- Limit file access to project directory
- Sanitize inputs before passing to shell

### Sensitive Data

- Never commit secrets or API keys
- Use environment variables for configuration
- Don't log sensitive information
- Review tool responses for leaked data

## Getting Help

### Documentation

- **Architecture**: `docs/architecture.md`
- **Contributing**: `CONTRIBUTING_IX.md`
- **FAQ**: `docs/faq.md`
- **Troubleshooting**: `docs/troubleshooting.md`

### Examples

- **Tools**: `packages/core/src/tools/`
- **Components**: `packages/cli/src/components/`
- **Extensions**: `extensions/hello/`
- **Tests**: `packages/*/src/**/*.test.ts`

---

**Note**: For unclear or incomplete sections, please provide feedback to improve
these instructions.

**Remember**: Always run `npm run preflight` before submitting PRs. Link every
PR to an issue.
