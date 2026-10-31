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
- **Client's role:** The client is responsible for sending requests (for
  example, prompts) and handling responses and notifications from Gemini CLI.
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

When Gemini CLI asks the client for permission to run an MCP tool via
`session/request_permission`, the request's `toolCall._meta['gemini-cli'].mcp`
contains `server_name` (the configured name under which the MCP server was
registered) and `tool_name` (the tool's own name as declared by that server).
Clients can compare the server name with the servers they supplied instead of
parsing the tool call title. These fields identify the server; they are not a
trust grant.

## Capabilities and supported methods

The ACP protocol exposes a number of methods for ACP clients (for example IDEs)
to control Gemini CLI.

### Core methods

- `initialize`: Establishes the initial connection and lets the client to
  register its MCP server.
- `authenticate`: Authenticates the user.
- `newSession`: Starts a new chat session.
- `loadSession`: Loads a previous session.
- `prompt`: Sends a prompt to the agent.
- `cancel`: Cancels an ongoing prompt.

### Session control

- `setSessionMode`: Allows changing the approval level for tool calls (for
  example, to `auto-approve`).
- `unstable_setSessionModel`: Changes the model for the current session.

### Gemini CLI extensions

Gemini CLI adds the following
[ACP extensions](https://agentclientprotocol.com/protocol/extensibility). They
are advertised under `agentCapabilities._meta["geminicli.com"]` in the
`initialize` response. A client that doesn't use them needs no changes.

#### Steering a running turn

A client can add a user message to a running `session/prompt` turn without
cancelling it, like [model steering](./model-steering.md) in the terminal. The
initialize response advertises it as follows:

```json
{
  "agentCapabilities": {
    "_meta": {
      "geminicli.com": {
        "steering": {
          "version": 1,
          "content": ["text"],
          "maxPending": 20,
          "maxChars": 8000,
          "enabled": true
        }
      }
    }
  }
}
```

Steering is enabled for a connection when the client opts in with
`clientCapabilities._meta["geminicli.com"].steering: true` in its `initialize`
request, or when the user has `experimental.modelSteering` turned on. `enabled`
tells the client which applies.

To steer, send the `_geminicli.com/session/steer` request while a
`session/prompt` is running:

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "_geminicli.com/session/steer",
  "params": {
    "sessionId": "…",
    "content": [{ "type": "text", "text": "Use the existing Logger class." }]
  }
}
```

The result is one of the following:

- `{ "status": "queued", "steerId": "st_1", "pending": 1 }`: the message reaches
  the model in this turn, or Gemini CLI returns it as undelivered (see below).
- `{ "status": "no_active_turn" }`: no prompt is running and nothing was stored.
  Send the message as a normal `session/prompt` instead.

Gemini CLI adds queued messages to the next request to the model: in front of
the results of the tool calls that are running, or as one more request if the
model was about to finish. A running tool is not interrupted; use
`session/cancel` for that. When a message is added, Gemini CLI sends a
`user_message_chunk` update with the user's text and
`_meta["geminicli.com"].steering = { "steerId": "st_1", "state": "delivered" }`.

If the turn ends before a queued message reaches the model (for example, it is
cancelled, a new `session/prompt` replaces it, or it hits the turn limit), the
`session/prompt` response lists the message in
`_meta["geminicli.com"].undeliveredSteering` as `[{ "steerId", "text" }]`. If
the turn fails with an error, each undelivered message is instead sent as a
`user_message_chunk` update with `state: "undelivered"` before the error. The
client can put these messages back in its input box.

The request fails with `-32602` for an unknown session, empty text, a non-text
content block, text over `maxChars`, more than `maxPending` queued messages, or
text that starts with `/` or `$` (send commands as a prompt). It fails with
`-32000` when steering is not enabled, and with `-32601` on versions of Gemini
CLI without steering.

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
