# Using Multiple Workspaces with MCP

This document describes how to use an external MCP server to enable Gemini CLI to reason across multiple local workspaces.

## Setup

(Instructions as before)

## Managing Workspaces

(Instructions as before)

## Validation

(Instructions as before)

## Testing

To run the test suite for the context broker, navigate to the `examples/multi_workspace/context_broker` directory and run `pytest`:

```bash
cd examples/multi_workspace/context_broker
pytest
```

The tests will cover unit, protocol, and integration scenarios. A CI workflow is also configured to run these tests automatically on every push to the feature branch.

## Troubleshooting

*   **DISCONNECTED Server:** If the `context_broker` shows as `DISCONNECTED` in `/mcp list`, first check the `command`, `args`, and `cwd` in your `settings.json`. Then, try to run the broker manually from the `cwd` to see if there are any errors:
    ```bash
    python -m context_broker
    ```
*   **Malformed Tool Schemas:** If you encounter errors related to tool schemas, ensure that the `get_tool_definitions` function in `server.py` returns a valid JSON schema for each tool.

## Security

(Instructions as before)
