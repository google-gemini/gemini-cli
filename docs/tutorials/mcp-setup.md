# Set up an MCP server

This tutorial demonstrates how to set up a Model Context Protocol (MCP) server
using the [GitHub MCP server](https://github.com/github/github-mcp-server) as an
example.

> **Warning:** Before using a third-party MCP server, ensure you trust its
> source and understand the tools it provides. Your use of third-party servers
> is at your own risk.

## Prerequisites

Before you begin, ensure you have the following installed and configured:

- **Docker:** Install and run [Docker](https://www.docker.com/).
- **GitHub Personal Access Token (PAT):** Create a new
  [classic](https://github.com/settings/tokens/new) or
  [fine-grained](https://github.com/settings/personal-access-tokens/new) PAT
  with the necessary scopes.

## Configure the MCP server

To add the server, you need to update your Gemini CLI settings.

1.  Open your [`.gemini/settings.json` file](../get-started/configuration.md).
2.  Add the `mcpServers` configuration block:

```json
{
  "mcpServers": {
    "github": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "ghcr.io/github/github-mcp-server"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

## Set your authentication token

Store your GitHub PAT in an environment variable. We recommend using a
fine-grained access token to limit the potential for data leakage.

```bash
GITHUB_PERSONAL_ACCESS_TOKEN="pat_YourActualGitHubTokenHere"
```

## Verify the connection

Launch Gemini CLI. It will automatically connect to the GitHub MCP server in the
background. You can then use natural language prompts to perform GitHub actions:

- "List my open pull requests in the `foo/bar` repository."
- "Get all open issues assigned to me and prioritize them."

## Next steps

- Explore the [MCP servers reference](../tools/mcp-server.md) for more
  transports and options.
- Learn about [Agent Skills](./agent-skills.md) for task-specific procedural
  knowledge.
