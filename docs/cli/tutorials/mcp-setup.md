# Set up an MCP server

Connect Gemini CLI to your external databases and services. In this guide,
you'll learn how to extend Gemini CLI's capabilities by installing the GitHub
MCP server and using it to manage your repositories.

## Prerequisites

- Gemini CLI installed.
- **Docker:** Required for this specific example (many MCP servers run as Docker
  containers).
- **GitHub token:** A Personal Access Token (PAT) with repo permissions.

## How to prepare your credentials

Most MCP servers require authentication. For GitHub, you need a PAT.

1.  Create a [fine-grained PAT](https://github.com/settings/tokens?type=beta).
2.  Grant it **Read** access to **Metadata** and **Contents**, and
    **Read/Write** access to **Issues** and **Pull Requests**.
3.  Store it in your environment:

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN="github_pat_..."
```

## How to configure Gemini CLI

You tell Gemini about new servers by editing your `settings.json`.

1.  Open `~/.gemini/settings.json` (or the project-specific
    `.gemini/settings.json`).
2.  Add the `mcpServers` block. This tells Gemini: "Run this docker container
    and talk to it."

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
        "ghcr.io/modelcontextprotocol/servers/github:latest"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

> **Note:** The `command` is `docker`, and the rest are arguments passed to it.
> We map the local environment variable into the container so your secret isn't
> hardcoded in the config file.

## How to verify the connection

Restart Gemini CLI. It will automatically try to start the defined servers.

**Command:** `/mcp list`

You should see: `✓ github: docker ... - Connected`

If you see `Disconnected` or an error, check that Docker is running and your API
token is valid.

## How to use the new tools

Now that the server is running, the agent has new capabilities ("tools"). You
don't need to learn special commands; just ask in natural language.

### Scenario: Listing pull requests

**Prompt:** `List the open PRs in the google/gemini-cli repository.`

The agent will:

1.  Recognize the request matches a GitHub tool.
2.  Call `github_list_pull_requests`.
3.  Present the data to you.

### Scenario: Creating an issue

**Prompt:**
`Create an issue in my repo titled "Bug: Login fails" with the description "See logs".`

## Troubleshooting

- **Server won't start?** Try running the docker command manually in your
  terminal to see if it prints an error (e.g., "image not found").
- **Tools not found?** Run `/mcp refresh` to force the CLI to re-query the
  server for its capabilities.

## Next steps

- Explore the [MCP servers reference](../../tools/mcp-server.md) to learn about
  SSE and HTTP transports for remote servers.
- Browse the
  [official MCP server list](https://github.com/modelcontextprotocol/servers) to
  find connectors for Slack, Postgres, Google Drive, and more.
