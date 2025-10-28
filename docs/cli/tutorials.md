# Tutorials

This page contains tutorials for interacting with Gemini CLI.

## Setting up a Model Context Protocol (MCP) server

> [!CAUTION] Before using a third-party MCP server, ensure you trust its source
> and understand the tools it provides. Your use of third-party servers is at
> your own risk.

This tutorial demonstrates how to set up a MCP server, using the
[GitHub MCP server](https://github.com/github/github-mcp-server) as an example.
The GitHub MCP server provides tools for interacting with GitHub repositories,
such as creating issues and commenting on pull requests.

### Prerequisites

Before you begin, ensure you have the following installed and configured:

- **Docker:** Install and run [Docker].
- **GitHub Personal Access Token (PAT):** Create a new [classic] or
  [fine-grained] PAT with the necessary scopes.

[Docker]: https://www.docker.com/
[classic]: https://github.com/settings/tokens/new
[fine-grained]: https://github.com/settings/personal-access-tokens/new

### Guide

#### Configure the MCP server in `settings.json`

In your project's root directory, create or open the
[`.gemini/settings.json` file](../get-started/configuration.md). Within the
file, add the `mcpServers` configuration block, which provides instructions for
how to launch the GitHub MCP server.

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

#### Set your GitHub token

> [!CAUTION] Using a broadly scoped personal access token that has access to
> personal and private repositories can lead to information from the private
> repository being leaked into the public repository. We recommend using a
> fine-grained access token that doesn't share access to both public and private
> repositories.

You need to set an environment variable to store your GitHub PAT. The specific variable name depends on how you're configuring the GitHub MCP server:

**Option 1: Direct configuration (as shown above)**

Set `GITHUB_PERSONAL_ACCESS_TOKEN` in your shell or `.env` file:

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN="pat_YourActualGitHubTokenHere"
```

Gemini CLI uses this value in the `mcpServers` configuration that you defined in
the `settings.json` file.

**Option 2: Using extensions (e.g., the GitHub MCP extension)**

Some extensions expect a different variable such as `GITHUB_MCP_PAT`. If you're
using the official GitHub MCP extension
(`gemini extensions install https://github.com/github/github-mcp-server`) or
any other extension that requires this variable, set it in `~/.gemini/.env`:

```bash
# In ~/.gemini/.env
GITHUB_MCP_PAT=pat_YourActualGitHubTokenHere
```

> [!NOTE]
> Different extensions may use different environment variable names. Check the
> extension's `gemini-extension.json` file to see which variables it expects.
> Gemini CLI automatically substitutes environment variables in extension
> configurations using `$VAR_NAME` or `${VAR_NAME}` syntax.

Gemini CLI uses whichever variable you configure—either directly in
`settings.json` or provided via an extension—when launching the GitHub MCP
server.

#### Launch Gemini CLI and verify the connection

When you launch Gemini CLI, it automatically reads your configuration and
launches the GitHub MCP server in the background. You can then use natural
language prompts to ask Gemini CLI to perform GitHub actions. For example:

```bash
"get all open issues assigned to me in the 'foo/bar' repo and prioritize them"
```
