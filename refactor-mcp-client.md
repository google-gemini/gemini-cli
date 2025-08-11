# Refactoring Plan: `mcp-client.ts`

This document outlines the plan to refactor `mcp-client.ts` into a more robust, object-oriented `McpClient` class, as per the reviewer's feedback.

## Tasks

- [x] **1. Create the `McpClient` Class:**
  - [x] Define a new `McpClient` class in `packages/core/src/tools/mcp-client.ts`.
  - [x] The constructor will accept `serverName`, `serverConfig`, `toolRegistry`, `promptRegistry`, `workspaceContext`, and `debugMode`.
  - [x] The class will manage its own state, including the underlying MCP SDK `Client` instance and its connection status (`CONNECTING`, `CONNECTED`, `DISCONNECTED`).
  - [x] Public methods will include `connect()`, `discover()`, `disconnect()`, and `getStatus()`.

- [x] **2. Consolidate Logic into `McpClient`:**
  - [x] Move the logic from the standalone functions `connectToMcpServer`, `createTransport`, and the OAuth handling functions into the `connect()` method of the `McpClient` class.
  - [x] Move the logic from `discoverTools` and `discoverPrompts` into the `discover()` method of the `McpClient` class.

- [x] **3. Refactor `McpClientManager`:**
  - [x] Update `McpClientManager` to hold a map of the new `McpClient` instances (`Map<string, McpClient>`).
  - [x] Simplify `discoverAllMcpTools()` to iterate through the server configurations, create an `McpClient` instance for each, and then call `connect()` and `discover()` on it.
  - [x] Remove the `connectAndDiscover` and `connectToServer` methods from `McpClientManager`.
  - [x] Update the `stop()` method to iterate through its `McpClient` instances and call `disconnect()` on each.

- [x] **4. Update Tests:**
  - [x] Update `mcp-client.test.ts` to test the new `McpClient` class.
  - [x] Update the tests for `McpClientManager` to mock the `McpClient` class.
