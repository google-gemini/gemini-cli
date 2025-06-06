# Tutorials

Master usage of Gemini CLI to automate development tasks.

## Setting up Model Context Protocol (MCP) Servers

> **A Note on Third-Party MCP Servers:** Before using a third-party MCP server, ensure you trust its source and understand the tools it provides. Your use of third-party servers is at your own risk.

### GitHub MCP Server

The [GitHub MCP server] provides tools for interacting with GitHub repositories, such as creating issues, commenting on pull requests, and more.

[GitHub MCP server]: https://github.com/github/github-mcp-server

#### Prerequisites

Before you begin, ensure you have the following installed and configured:

- **Docker:** Install and run [Docker].
- **GitHub Personal Access Token (PAT):** Create a new [classic] or [fine-grained] PAT with the necessary scopes.

[Docker]: https://www.docker.com/
[classic]: https://github.com/settings/tokens/new
[fine-grained]: https://github.com/settings/personal-access-tokens/new

#### Guide

##### Configure the MCP Server in `settings.json`

In your project's root directory, create or open the `.gemini/settings.json` file. Add the `mcpServers` configuration block to instruct Gemini how to launch the GitHub server.

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

##### Set Your GitHub Token

Use an environment variable to store your PAT.

```bash
GITHUB_PERSONAL_ACCESS_TOKEN="pat_YourActualGitHubTokenHere"
```

Gemini CLI will automatically substitute the `${GITHUB_PERSONAL_ACCESS_TOKEN}` placeholder from your `settings.json` file.

##### Launch Gemini CLI and Verify the Connection

Gemini CLI will automatically read your configuration and launch the GitHub MCP server in the background. You can ask Gemini CLI to perform GitHub actions in natural language.

```bash
"get all open issues assigned to me in the 'foo/bar' repo and prioritize them"
```
