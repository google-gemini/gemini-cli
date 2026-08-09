# Agent Client Protocol (ACP) Implementation

This directory contains the implementation of the Agent Client Protocol (ACP)
for the Gemini CLI. The ACP allows external clients (like IDE extensions) to
communicate with the Gemini CLI agent over a structured JSON-RPC based protocol.

## Directory Structure

Following Phase 1 of the modularization refactor, the ACP client is organized
into the following specialized modules, all sharing the `acp` prefix for
consistency:

- **[acpStdioTransport.ts](./acpStdioTransport.ts)**: Handles raw I/O. It sets
  up the Web streams for standard input/output and creates the
  `AgentSideConnection` using line-delimited JSON (ndjson).
- **[acpRpcDispatcher.ts](./acpRpcDispatcher.ts)**: Contains the `GeminiAgent`
  class. This is the main entry point for incoming JSON-RPC messages. It
  implements the protocol methods and delegates session-specific work to the
  manager and individual sessions.
- **[acpSessionManager.ts](./acpSessionManager.ts)**: Manages multi-session
  state. It handles session creation (`newSession`), loading (`loadSession`),
  and configuration, isolating session state from the RPC routing.
- **[acpSession.ts](./acpSession.ts)**: Manages individual active chat sessions.
  It handles prompt execution, `@path` file resolution, tool execution, command
  interception, and streaming updates back to the client.
- **[acpUtils.ts](./acpUtils.ts)**: Contains shared helper functions, type
  mappers (e.g., mapping internal tool kinds to ACP kinds), and Zod schemas used
  across the modules.
- **[acpErrors.ts](./acpErrors.ts)**: Centralized error handling and mapping to
  ACP-compliant error codes.
- **[acpCommandHandler.ts](./acpCommandHandler.ts)**: Handles interception and
  execution of slash commands (e.g., `/memory`, `/init`) sent via ACP prompts.
- **[acpFileSystemService.ts](./acpFileSystemService.ts)**: Provides access to
  the file system restricted by the workspace boundaries and permissions.

## Development Instructions

### Running Tests

Tests are co-located with the source files:

- `acpRpcDispatcher.test.ts`: Tests for initialization, authentication, and
  handler delegation.
- `acpSessionManager.test.ts`: Tests for session lifecycle and configuration.
- `acpSession.test.ts`: Tests for prompt loops, tool execution, and @path
  resolution.
- `acpResume.test.ts`: Integration tests for loading/resuming sessions.

To run specific tests, use Vitest with the workspace filter:

```bash
# General pattern
npm test -w @google/gemini-cli -- src/acp/<test-file-name>.ts

# Example
npm test -w @google/gemini-cli -- src/acp/acpRpcDispatcher.test.ts
```

Note: You may need to ensure your environment has Node available. If running in
a restricted environment, try sourcing NVM first:

```bash
source ~/.nvm/nvm.sh && nvm use default && npm test -w @google/gemini-cli -- src/acp/acpSession.test.ts
```

### Adding New Features

- **New RPC Method**: Add the method to `GeminiAgent` in `acpRpcDispatcher.ts`
  and register it in the `AgentSideConnection` setup if necessary.
- **Session State**: If a feature requires storing state across turns within a
  session, add it to the `Session` class in `acpSession.ts`.
- **Protocol Helpers**: Add any new mapping or serialization logic to
  `acpUtils.ts`.

### Coding Conventions

- **Imports**: Use specific imports and do not import across package boundaries
  using relative paths.
- **License Headers**: All new files must include the Apache-2.0 license header.
- **Type Safety**: Avoid using `any` assertions. Use Zod schemas to validate
  untrusted input from the protocol.
