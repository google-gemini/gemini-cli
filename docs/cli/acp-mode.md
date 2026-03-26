# ACP Mode

ACP (Agent Client Protocol) mode is a special operational mode of Gemini CLI
designed for programmatic control, primarily for IDE and other developer tool
integrations. It uses a JSON-RPC protocol over stdio to communicate between
Gemini CLI agent and a client.

To start Gemini CLI in ACP mode, use the `--acp` flag:

```bash
gemini --acp
```

## Agent Client Protocol (ACP)

ACP is an open protocol that standardizes how AI coding agents communicate with
code editors and IDEs. It addresses the challenge of fragmented distribution,
where agents traditionally needed custom integrations for each client. With ACP,
developers can implement their agent once, and it becomes compatible with any
ACP-compliant editor.

For a comprehensive introduction to ACP, including its architecture and
benefits, refer to the official
[ACP Introduction](https://agentclientprotocol.com/get-started/introduction)
documentation.

### Existing integrations using ACP

The ACP Agent Registry simplifies the distribution and management of
ACP-compatible agents across various IDEs. Gemini CLI is an ACP-compatible agent
and can be found in this registry.

For more general information about the registry, and how to use it with specific
IDEs like JetBrains and Zed, refer to the
[IDE Integration](../ide-integration/index.md) documentation.

You can also find more information on the official
[ACP Agent Registry](https://agentclientprotocol.com/get-started/registry) page.

## Architecture and protocol basics

ACP mode establishes a client-server relationship between your tool (the client)
and Gemini CLI (the server).

- **Communication:** The entire communication happens over standard input/output
  (stdio) using the JSON-RPC 2.0 protocol.
- **Client's role:** The client is responsible for sending requests (e.g.,
  prompts) and handling responses and notifications from Gemini CLI.
- **Gemini CLI's role:** In ACP mode, Gemini CLI listens for incoming JSON-RPC
  requests, processes them, and sends back responses.

The core of the ACP implementation can be found in
`packages/cli/src/acp/acpClient.ts`.

### Extending with MCP

ACP can be used with the Model Context Protocol (MCP). This lets an ACP client
(like an IDE) expose its own functionality as "tools" that the Gemini model can
use.

1.  The client implements an **MCP server** that advertises its tools.
2.  During the ACP `initialize` handshake, the client provides the connection
    details for its MCP server.
3.  Gemini CLI connects to the MCP server, discovers the available tools, and
    makes them available to the AI model.
4.  When the model decides to use one of these tools, Gemini CLI sends a tool
    call request to the MCP server.

This mechanism lets for a powerful, two-way integration where the agent can
leverage the IDE's capabilities to perform tasks. The MCP client logic is in
`packages/core/src/tools/mcp-client.ts`.

## Capabilities and supported methods

The ACP protocol exposes a number of methods for ACP clients (e.g. IDEs) to
control Gemini CLI.

### Core methods

- `initialize`: Establishes the initial connection and lets the client to
  register its MCP server.
- `authenticate`: Authenticates the user.
- `newSession`: Starts a new chat session.
- `loadSession`: Loads a previous session.
- `prompt`: Sends a prompt to the agent.
- `cancel`: Cancels an ongoing prompt.

### Session control

- `setSessionMode`: Allows changing the approval level for tool calls (e.g., to
  `auto-approve`).
- `unstable_setSessionModel`: Changes the model for the current session.

### File system proxy

ACP includes a proxied file system service. This means that when the agent needs
to read or write files, it does so through the ACP client. This is a security
feature that ensures the agent only has access to the files that the client (and
by extension, the user) has explicitly allowed.

## Debugging and telemetry

You can get insights into the ACP communication and the agent's behavior through
debugging logs and telemetry.

### Debugging logs

To enable general debugging logs, start Gemini CLI with the `--debug` flag:

```bash
gemini --acp --debug
```

### Telemetry

For more detailed telemetry, you can use the following environment variables to
capture telemetry data to a file:

- `GEMINI_TELEMETRY_ENABLED=true`
- `GEMINI_TELEMETRY_TARGET=local`
- `GEMINI_TELEMETRY_OUTFILE=/path/to/your/log.json`

This will write a JSON log file containing detailed information about all the
events happening within the agent, including ACP requests and responses. The
integration test `integration-tests/acp-telemetry.test.ts` provides a working
example of how to set this up.
