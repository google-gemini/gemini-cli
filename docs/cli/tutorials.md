# Gemini CLI Tutorials

This page provides practical, step-by-step tutorials to help you leverage the full power of the Gemini CLI for various development tasks. Each tutorial is designed to guide you through a specific use case, from setting up custom tools to automating complex workflows.

## Setting up a Model Context Protocol (MCP) server

> [!CAUTION]
> Before using a third-party MCP server, ensure you trust its source and understand the tools it provides. Your use of third-party servers is at your own risk.

This tutorial demonstrates how to set up a Model Context Protocol (MCP) server, using the [GitHub MCP server](https://github.com/github/github-mcp-server) as a practical example. The GitHub MCP server provides tools for interacting with GitHub repositories, such as creating issues and commenting on pull requests, directly from the Gemini CLI.

### Prerequisites

Before you begin this tutorial, ensure you have the following installed and configured on your system:

- **Docker:** Install and run [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for macOS/Windows) or [Docker Engine](https://docs.docker.com/engine/install/) (for Linux). This is essential for running the containerized MCP server.
- **GitHub Personal Access Token (PAT):** Create a new [classic](https://github.com/settings/tokens/new) or [fine-grained](https://github.com/settings/personal-access-tokens/new) PAT with the necessary scopes for repository access (e.g., `repo` scope for classic PATs, or specific repository permissions for fine-grained PATs). This token will allow the MCP server to interact with your GitHub repositories.

### Guide

Follow these steps to set up and use the GitHub MCP server with your Gemini CLI:

#### 1. Configure the MCP server in `settings.json`

In your project's root directory, create or open the [`.gemini/settings.json` file](./configuration.md). Add the `mcpServers` configuration block, which instructs Gemini CLI on how to launch the GitHub MCP server. This configuration tells the CLI to run a Docker container for the server and pass your GitHub PAT as an environment variable.

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

#### 2. Set your GitHub token

It is crucial to store your GitHub Personal Access Token (PAT) securely using an environment variable. **Never hardcode your PAT directly into `settings.json` or any script.**

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN="pat_YourActualGitHubTokenHere"
```

This environment variable will be automatically picked up by the Gemini CLI and passed to the Docker container as configured in your `settings.json` file.

> [!CAUTION]
> Using a broadly scoped personal access token that has access to personal and private repositories can lead to information from the private repository being leaked into the public repository. We highly recommend using a fine-grained access token that grants only the necessary permissions and does not share access to both public and private repositories.

#### 3. Launch Gemini CLI and verify the connection

When you launch Gemini CLI, it automatically reads your configuration and launches the GitHub MCP server in the background. You can then use natural language prompts to ask Gemini CLI to perform GitHub actions.

```bash
gemini # Or 'npm start' if running from source
```

Once the CLI is running, you can verify the MCP server connection and discovered tools using the `/mcp` command:

```
/mcp
```

Look for `github (CONNECTED)` in the output, and a list of tools like `github__create_issue`, `github__comment_on_pr`, etc.

**Example Prompt:**

```bash
"get all open issues assigned to me in the 'foo/bar' repo and prioritize them"
```

### Troubleshooting

If you encounter issues while setting up or using the MCP server, consider the following:

- **Docker Not Running:** Ensure Docker Desktop (or Docker Engine) is running and accessible. Check its status and restart if necessary.
- **Incorrect PAT:** Double-check that your `GITHUB_PERSONAL_ACCESS_TOKEN` is correct and has the necessary permissions. A common issue is an expired or improperly scoped token.
- **`settings.json` Syntax Errors:** Verify that your `.gemini/settings.json` file is valid JSON. Even a small syntax error can prevent the CLI from loading the configuration.
- **Network Issues:** Ensure your system has a stable internet connection to pull the Docker image and for the MCP server to communicate with GitHub.
- **MCP Server Logs:** If the MCP server fails to start or connect, check the Gemini CLI's verbose output (run with `--debug_mode`) for any error messages from the Docker container or the MCP server itself.
- **Firewall/Proxy:** If you are behind a firewall or proxy, ensure that Docker and the Gemini CLI have the necessary network access.

### Next Steps

Now that you have successfully set up an MCP server, consider exploring these advanced topics:

- **Explore More Tools:** Use the `/tools` command to see all available tools, including those exposed by your MCP server. Experiment with different prompts to utilize these new capabilities.
- **Create Custom MCP Servers:** Learn how to build your own MCP servers to expose custom tools tailored to your specific workflows or internal systems. Refer to the [MCP Server documentation](../tools/mcp-server.md) for more details.
- **Integrate with CI/CD:** Explore how to use Gemini CLI in non-interactive mode within your continuous integration and deployment pipelines to automate tasks.
- **Advanced Configuration:** Dive deeper into the [CLI Configuration](./configuration.md) to fine-tune other aspects of Gemini CLI's behavior, such as sandboxing or telemetry.
