# A2A Server

The A2A Server is a core component of the Gemini CLI that implements the
Agent-to-Agent (A2A) protocol. It enables external clients, such as IDEs or
other AI agents, to interact with the Gemini CLI agent through a standardized,
streaming interface.

<!-- prettier-ignore -->
> [!NOTE]
> This is an experimental feature currently under active development.

The A2A Server allows Gemini CLI to function as a backend service, providing
capabilities like code generation, tool execution, and workspace analysis to
client applications like Zed, VS Code, and Gemini Code Assist.

## Overview

The A2A Server implements the `development-tool` extension for the A2A protocol.
This extension defines a communication contract for rich, interactive workflows,
including:

- **Task-based streaming:** Real-time updates on the agent's thoughts and tool
  invocations.
- **Permission requests:** Standardized mechanism for the agent to request user
  approval before executing potentially sensitive tools.
- **Tool lifecycle management:** A structured state machine for tracking tool
  execution from creation to completion.
- **Slash command execution:** Programmatic access to built-in Gemini CLI
  commands.

## Usage

The A2A Server can be started independently or as part of an integrated
workflow.

### Starting the server

In a development environment, you can launch the A2A Server from the project
root using npm:

```bash
npm run start:a2a-server
```

This command builds the necessary dependencies and starts the server on its
default port. The server provides an SSE (Server-Sent Events) stream for
real-time updates to connected A2A clients.

### Integration with IDEs

Many IDE integrations use the A2A Server to power their "Agent Mode" features.
For example, the [VS Code companion](../ide-integration/index.md) communicates
with the A2A Server to execute complex coding tasks within your workspace.

## Key features

### Development tool extension

The A2A Server uses a specialized set of schemas to enable rich client
interactions:

- **Agent thoughts:** Streams the agent's internal reasoning as it works through
  a task.
- **Tool calls:** Provides a detailed, stateless representation of tool
  execution, including `PENDING`, `EXECUTING`, and `SUCCEEDED` statuses.
- **Confirmation requests:** Requests user permission for shell commands, file
  edits, or MCP tool usage via the client UI.

### Separation of concerns

The A2A architecture enforces a strict separation of concerns:

1.  **A2A Protocol:** Standardizes the communication and task management between
    the client and the Gemini CLI agent.
2.  **MCP (Model Context Protocol):** Serves as the authoritative interface for
    accessing client-side capabilities, such as reading active buffers or
    accessing the local file system.

## Troubleshooting

If you encounter issues with the A2A Server:

- **Check logs:** Review the server output for errors during initialization or
  client connection.
- **Verify A2A compliance:** Ensure that the client application is correctly
  implementing the A2A protocol and the `development-tool` extension.
- **Network permissions:** Ensure that the server has the necessary permissions
  to listen on its configured port and communicate with MCP servers.

## Next steps

- Learn about [Remote subagents](./remote-agents.md) and A2A connectivity.
- Explore the [IDE integration guide](../ide-integration/index.md).
