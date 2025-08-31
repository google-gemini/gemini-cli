# Using Multiple Workspaces with MCP

This document describes how to use an external MCP server to enable Gemini CLI to reason across multiple local workspaces.

## Setup

1.  **Define your workspaces:**
    Create a `workspaces.json` file in your project's `.gemini` directory. This file defines the workspaces the context broker can access. The paths should be relative to the location of the `workspaces.json` file.

    **`examples/multi-workspace/.gemini/workspaces.json`:**
    ```json
    {
      "workspaces": [
        {
          "name": "client",
          "path": "client"
        },
        {
          "name": "server",
          "path": "server"
        }
      ]
    }
    ```

2.  **Configure Gemini CLI:**
    Update your project's `.gemini/settings.json` to include the MCP server. The `cwd` should be the path to the directory containing the `context_broker` package.

    **`examples/multi-workspace/.gemini/settings.json`:**
    ```json
    {
      "mcpServers": {
        "context-broker": {
          "command": "python",
          "args": ["-m", "context_broker"],
          "cwd": "examples/multi-workspace"
        }
      }
    }
    ```

## Validation

1.  **Test the context broker independently:**
    From the `examples/multi-workspace` directory, run:
    ```bash
    python -m context_broker
    ```
    The script should start and wait for input. This confirms the Python module is working correctly.

2.  **Launch Gemini CLI** from the root of the project (`D:\open source\gemini-cli`).

3.  **Verify the connection:**
    Run the `/mcp` command in the interactive CLI, then select `list`. You should see the `context-broker` listed as **CONNECTED**, along with its available tools:
    *   `list_contexts`
    *   `read_file`
    *   `search_code`
    *   `dependency_graph`
    *   `summarize_repo`

    If the server shows as **DISCONNECTED**, check the `command`, `args`, and `cwd` in your `settings.json`. You can also check the broker's logs in `examples/multi-workspace/.gemini/logs/context-broker.jsonl`.

4.  **Use the tools in a prompt.** For example:
    > What are the dependencies for the client and server?

    This should trigger the `dependency_graph` tool for both contexts.

## Security

The context broker has several security features:

*   **Workspace Manifest:** The broker can only access workspaces defined in `workspaces.json`.
*   **Logging:** All tool calls are logged to `examples/multi-workspace/.gemini/logs/context-broker.jsonl`.
