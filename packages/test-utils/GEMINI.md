# Gemini CLI Test Utils (`@google/gemini-cli-test-utils`)

Shared test utilities used across the monorepo. This is a private package — not
published to npm.

## Key Modules

- `src/test-rig.ts`: The primary test rig for spinning up end-to-end CLI
  sessions with mock responses.
- `src/file-system-test-helpers.ts`: Helpers for creating temporary file system
  fixtures.
- `src/mock-utils.ts`: Common mock utilities.
- `src/test-mcp-server.ts`: Helper for building test MCP servers for tests.
- `src/test-mcp-server-template.mjs`: Generic template script for running
  isolated MCP processes.

## Test MCP Servers

The `TestRig` provides a fully isolated, compliant way to test tool triggers and
workflows using local test MCP servers. This isolates your tests from live API
endpoints and rate-limiting.

### Usage

1. **Programmatic Builder:**

   ```typescript
   import { TestMcpServerBuilder } from '@google/gemini-cli-test-utils';

   const builder = new TestMcpServerBuilder('weather-server').addTool(
     'get_weather',
     'Get weather',
     'It is rainy',
   );

   rig.addTestMcpServer('weather-server', builder.build());
   ```

2. **Predefined configurations via JSON:** Place a configuration file in
   `packages/test-utils/assets/test-servers/google-workspace.json` and load it
   by title:

   ```typescript
   rig.addTestMcpServer('workspace-server', 'google-workspace');
   ```

   **JSON Format Structure (`TestMcpConfig`):**

   ```json
   {
     "name": "string (Fallback server name)",
     "tools": [
       {
         "name": "string (Tool execution name)",
         "description": "string (Helpful summary for router)",
         "inputSchema": {
           "type": "object",
           "properties": { ... }
         },
         "response": "string | object (The forced reply payload)"
       }
     ]
   }
   ```

## Usage

Import from `@google/gemini-cli-test-utils` in test files across the monorepo.
