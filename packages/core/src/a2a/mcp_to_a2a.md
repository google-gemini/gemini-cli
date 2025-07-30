# Design Doc: A2A Protocol MCP Server

This document outlines the design for creating a new, standalone Model Context Protocol (MCP) server that acts as a bridge to the Agent-to-Agent (A2A) communication protocol. This server will run as a separate process and allow the Gemini CLI to interact with A2A agents by exposing A2A functionalities as standard MCP tools.

### 1. Overview

The goal is to enable Gemini CLI to leverage the A2A ecosystem. We will create a standalone Node.js script that implements a real MCP server. The Gemini CLI will then connect to this server as it would with any other external tool provider. This approach ensures a clean separation of concerns and aligns with the standard MCP architecture.

### 2. Location

The new module will be located in: `packages/core/src/a2a/`

The key files will be:
- `mcp_to_a2a.md`: This design document.
- `a2a-mcp-server.ts`: The main, executable entry point for the standalone MCP server.
- `a2a-client.ts`: A wrapper around the `a2a-js` SDK client for managing connections to A2A agents.
- `tools.ts`: The MCP tool schemas and their corresponding implementation logic.
- `types.ts`: TypeScript types and interfaces specific to this module, re-exporting from `@a2a-js/sdk`.

### 3. Dependencies

- `@a2a-js/sdk`: The official JavaScript SDK for the A2A protocol.
- `@modelcontextprotocol/sdk`: The SDK for building MCP clients and servers.

### 4. Core Components

#### 4.1. A2AClientManager (`a2a-client.ts`)

This component is a singleton responsible for managing the state of interactions with the A2A network. It does **not** manage the MCP connection, but rather the connections to the A2A agents themselves.

- **A2A Client Instance:** It holds a single instance of the `A2AClient` from the `@a2a-js/sdk`.
- **AgentCard Cache:** It maintains an in-memory cache of `AgentCard` objects, mapping agent URLs to their fetched metadata.

#### 4.2. A2A MCP Server (`a2a-mcp-server.ts`)

This is the main executable for the server. It is a standalone Node.js script.

- **Server Instance:** It creates an instance of the `Server` class from `@modelcontextprotocol/sdk/server`.
- **Transport Layer:** It uses `StdioServerTransport` to communicate with the parent Gemini CLI process over standard input/output.
- **Tool Registration:** It imports the tool schemas and implementations from `tools.ts`. It then calls `server.registerTool()` for each A2A tool to make them available over MCP.
- **Lifecycle:** It starts the server and listens for incoming MCP requests from the Gemini CLI.

### 5. MCP Tool Definitions (`tools.ts`)

This file defines both the schema (`FunctionDeclaration`) and the implementation for each tool.

#### 5.1. `load_agent`
- **Description:** "Retrieves and caches an agent's metadata (AgentCard) from a URL to make it known to the system."
- **Implementation:** Calls `A2AClientManager.getInstance().loadAgent(url)`.

#### 5.2. `list_agents`
- **Description:** "Lists all A2A agents whose AgentCards have been loaded."
- **Implementation:** Calls `A2AClientManager.getInstance().listAgents()`.

#### 5.3. `send_message`
- **Description:** "Connects to a known A2A agent, sends a message, and returns a task ID."
- **Implementation:** Connects on-demand using `client.connect()` and then calls `agent.sendMessage()`.

#### 5.4. `get_task` & 5.5. `cancel_task`
- **Description:** Tools for managing tasks initiated by `send_message`.
- **Implementation:** These will be stubbed out initially, as the underlying SDK support for querying tasks by ID across different agents needs further investigation.

### 6. Integration with Gemini CLI

The Gemini CLI will connect to this new server as a generic, command-based MCP server.

1.  **Configuration (`settings.json`):** The user will configure the server in their settings file. This tells the Gemini CLI how to run the server.

    ```json
    "gemini.mcpServers": {
      "a2a": {
        "command": "node",
        "args": [
          "/path/to/gemini-cli/packages/core/dist/a2a/a2a-mcp-server.js"
        ],
        "description": "A2A Protocol Bridge"
      }
    }
    ```

2.  **Tool Discovery:**
    - On startup, the Gemini CLI's `ToolRegistry` reads the `mcpServers` configuration.
    - It sees the `a2a` server entry and uses the `command` and `args` to `spawn` the `a2a-mcp-server.ts` script as a child process.
    - It establishes a connection to the child process over its `stdin` and `stdout` using the `StdioClientTransport`.
    - It then sends a standard `getTools` request to the server.
    - The `a2a-mcp-server` receives the request and responds with the list of registered A2A tools.
    - The Gemini CLI receives the response and populates the tools in the UI.

### 7. Error Handling

Errors from the `a2a-js` SDK will be caught within the tool implementations inside the `a2a-mcp-server` process. They will be properly formatted and sent back to the Gemini CLI as standard MCP error responses.
