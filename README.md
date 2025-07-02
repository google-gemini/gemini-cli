# Gemini Copilot

[![Gemini Copilot CI](https://github.com/binnyarora/gemini-copilot/actions/workflows/ci.yml/badge.svg)](https://github.com/binnyarora/gemini-copilot/actions/workflows/ci.yml)

![Gemini CLI Screenshot](./docs/assets/gemini-screenshot.png)

**Disclaimer: This is a fork of Google's Gemini CLI. This project is not affiliated with or endorsed by Google.**

This repository contains **Gemini Copilot**, a fork of Google's Gemini CLI that uses GitHub Copilot as the default LLM provider via VSCode's Language Model API. This allows users with GitHub Copilot subscriptions to use their existing authentication instead of Google's Gemini API.

Based on Google's Gemini CLI - Original repository: https://github.com/google-gemini/gemini-cli

With Gemini Copilot you can:

- Query and edit large codebases in and beyond Gemini's 1M token context window.
- Generate new apps from PDFs or sketches, using Gemini's multimodal capabilities.
- Automate operational tasks, like querying pull requests or handling complex rebases.
- Use tools and MCP servers to connect new capabilities, including [media generation with Imagen,
  Veo or Lyria](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia)
- Ground your queries with the [Google Search](https://ai.google.dev/gemini-api/docs/grounding)
  tool, built in to Gemini.

## Quickstart

1. **Prerequisites:** 
   - [Node.js version 18](https://nodejs.org/en/download) or higher
   - [VSCode](https://code.visualstudio.com/) with [GitHub Copilot Extension](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot)
   - Active GitHub Copilot subscription

2. **Install and run:**

   ```bash
   npm install -g binora/gemini-copilot
   gemini-copilot
   ```

3. **Setup:** The first run will guide you through:
   - VSCode detection and connection
   - GitHub Copilot authentication verification  
   - Bridge extension installation
   - Color theme selection

You are now ready to use Gemini Copilot with your existing GitHub Copilot subscription!

### Fallback to Gemini API (Optional):

If you want to use Gemini as a fallback when VSCode/Copilot is not available:

1. Generate a key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Set it as an environment variable in your terminal:

   ```bash
   export GEMINI_API_KEY="YOUR_API_KEY"
   ```

3. Configure fallback in your settings:
   ```bash
   gemini-copilot config --provider copilot --fallback-to-gemini true
   ```

For other authentication methods, see the [authentication](./docs/cli/authentication.md) guide.

## Examples

Once the CLI is running, you can start interacting with GitHub Copilot from your shell.

You can start a project from a new directory:

```sh
cd new-project/
gemini-copilot
> Write me a Discord bot that answers questions using a FAQ.md file I will provide
```

Or work with an existing project:

```sh
git clone https://github.com/binnyarora/gemini-copilot
cd gemini-copilot
gemini-copilot
> Give me a summary of all of the changes that went in yesterday
```

### Next steps

- Learn how to [contribute to or build from the source](./CONTRIBUTING.md).
- Explore the available **[CLI Commands](./docs/cli/commands.md)**.
- If you encounter any issues, review the **[Troubleshooting guide](./docs/troubleshooting.md)**.
- For more comprehensive documentation, see the [full documentation](./docs/index.md).
- Take a look at some [popular tasks](#popular-tasks) for more inspiration.

### Troubleshooting

Head over to the [troubleshooting](docs/troubleshooting.md) guide if you're
having issues.

## Popular tasks

### Explore a new codebase

Start by `cd`ing into an existing or newly-cloned repository and running `gemini-copilot`.

```text
> Describe the main pieces of this system's architecture.
```

```text
> What security mechanisms are in place?
```

### Work with your existing code

```text
> Implement a first draft for GitHub issue #123.
```

```text
> Help me migrate this codebase to the latest version of Java. Start with a plan.
```

### Automate your workflows

Use MCP servers to integrate your local system tools with your enterprise collaboration suite.

```text
> Make me a slide deck showing the git history from the last 7 days, grouped by feature and team member.
```

```text
> Make a full-screen web app for a wall display to show our most interacted-with GitHub issues.
```

### Interact with your system

```text
> Convert all the images in this directory to png, and rename them to use dates from the exif data.
```

```text
> Organise my PDF invoices by month of expenditure.
```

### Uninstall

Head over to the [Uninstall](docs/Uninstall.md) guide for uninstallation instructions.

## Terms of Service and Privacy Notice

For details on the terms of service and privacy notice applicable to your use of Gemini CLI, see the [Terms of Service and Privacy Notice](./docs/tos-privacy.md).
