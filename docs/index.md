# Gemini CLI documentation

Gemini CLI brings the power of Gemini models directly into your terminal. Use it
to understand code, automate tasks, and build workflows with your local project
context.

## Install

```bash
npm install -g @google/gemini-cli
```

## Get started

- **[Overview](./index.md):** An overview of Gemini CLI and its features.
- **[Quickstart](./get-started/index.md):** Your first session with Gemini CLI.
- **[Installation](./get-started/installation.md):** How to install Gemini CLI
  on your system.
- **[Authentication](./get-started/authentication.md):** Setup instructions for
  personal and enterprise accounts.
- **[Examples](./get-started/examples.md):** Practical examples of Gemini CLI in
  action.
- **[CLI cheatsheet](./cli/cli-reference.md):** A quick reference for common
  commands and options.
- **[Gemini 3 on Gemini CLI](./get-started/gemini-3.md):** Learn how to use
  Gemini 3 with Gemini CLI.

## Use Gemini CLI

- **[File management](./cli/tutorials/file-management.md):** How to work with
  local files and directories.
- **[Manage context and memory](./cli/tutorials/memory-management.md):**
  Managing persistent instructions and facts.
- **[Execute shell commands](./cli/tutorials/shell-commands.md):** Executing
  system commands safely.
- **[Manage sessions and history](./cli/tutorials/session-management.md):**
  Resuming, managing, and rewinding conversations.
- **[Plan tasks with todos](./cli/tutorials/task-planning.md):** Using todos for
  complex workflows.
- **[Web search and fetch](./cli/tutorials/web-tools.md):** Searching and
  fetching content from the web.
- **[Get started with skills](./cli/tutorials/skills-getting-started.md):**
  Getting started with specialized expertise.
- **[Set up an MCP server](./cli/tutorials/mcp-setup.md):** Learn how to set up
  a Model-Context Protocol server.
- **[Automate tasks](./cli/tutorials/automation.md):** Automate common
  development tasks.

## Features

- **[Agent Skills](./cli/skills.md):** Extend the capabilities of Gemini CLI
  with custom skills.
- **[Authentication](./get-started/authentication.md):** Learn about the
  different authentication methods.
- **[Checkpointing](./cli/checkpointing.md):** Automatically save and restore
  your sessions.
- **[Extensions](./extensions/index.md):** Extend the functionality of Gemini
  CLI with extensions.
- **[Headless mode](./cli/headless.md):** Run Gemini CLI in a non-interactive
  mode.
- **[Hooks](./hooks/index.md):** Customize the behavior of Gemini CLI with
  hooks.
- **[IDE integration](./ide-integration/index.md):** Integrate Gemini CLI with
  your favorite IDE.
- **[MCP servers](./tools/mcp-server.md):** Connect to Model-Context Protocol
  servers.
- **[Model routing](./cli/model-routing.md):** Automatically route requests to
  the best model.
- **[Model selection](./cli/model.md):** Learn how to select the right model for
  your task.
- **[Plan mode (experimental)](./cli/plan-mode.md):** Plan and review changes
  before they are executed.
- **[Rewind](./cli/rewind.md):** Rewind the conversation to a previous point.
- **[Sandboxing](./cli/sandbox.md):** Isolate tool execution in a sandboxed
  environment.
- **[Settings](./cli/settings.md):** Customize the behavior of Gemini CLI.
- **[Telemetry](./cli/telemetry.md):** Understand the usage data that Gemini CLI
  collects.
- **[Token caching](./cli/token-caching.md):** Cache tokens to improve
  performance.

## Configuration

- **[Custom commands](./cli/custom-commands.md):** Create your own custom
  commands.
- **[Enterprise configuration](./cli/enterprise.md):** Configure Gemini CLI for
  your enterprise.
- **[Ignore files (.geminiignore)](./cli/gemini-ignore.md):** Ignore files and
  directories.
- **[Model configuration](./cli/generation-settings.md):** Configure the
  generation settings for your models.
- **[Project context (GEMINI.md)](./cli/gemini-md.md):** Provide
  project-specific context to the model.
- **[Settings](./cli/settings.md):** A full reference of all the available
  settings.
- **[System prompt override](./cli/system-prompt.md):** Override the default
  system prompt.
- **[Themes](./cli/themes.md):** Customize the look and feel of Gemini CLI.
- **[Trusted folders](./cli/trusted-folders.md):** Configure trusted folders to
  bypass security warnings.

## Extensions

- **[Overview](./extensions/index.md):** An overview of the extension system.
- **[User guide: Install and manage](./extensions/index.md#manage-extensions):**
  Learn how to install and manage extensions.
- **[Developer guide: Build extensions](./extensions/writing-extensions.md):**
  Learn how to build your own extensions.
- **[Developer guide: Best practices](./extensions/best-practices.md):** Best
  practices for writing extensions.
- **[Developer guide: Releasing](./extensions/releasing.md):** Learn how to
  release your extensions.
- **[Developer guide: Reference](./extensions/reference.md):** A full reference
  of the extension API.

## Development

- **[Contribution guide](/docs/contributing):** Learn how to contribute to
  Gemini CLI.
- **[Integration testing](./integration-tests.md):** Learn how to run the
  integration tests.
- **[Issue and PR automation](./issue-and-pr-automation.md):** Learn about the
  issue and PR automation.
- **[Local development](./local-development.md):** Learn how to set up your
  local development environment.
- **[NPM package structure](./npm.md):** Learn about the structure of the NPM
  packages.

## Reference

- **[Command reference](./reference/commands.md):** A full reference of all the
  available commands.
- **[Configuration reference](./reference/configuration.md):** A full reference
  of all the available configuration options.
- **[Keyboard shortcuts](./reference/keyboard-shortcuts.md):** A list of all the
  available keyboard shortcuts.
- **[Memory import processor](./reference/memport.md):** Learn how to use the
  memory import processor.
- **[Policy engine](./reference/policy-engine.md):** Learn how to use the policy
  engine.
- **[Tools API](./reference/tools-api.md):** Learn how to use the tools API.

## Resources

- **[Quota and pricing](./resources/quota-and-pricing.md):** Information about
  quota and pricing.
- **[Terms and privacy](./resources/tos-privacy.md):** The terms of service and
  privacy policy.
- **[FAQ](./resources/faq.md):** Frequently asked questions.
- **[Troubleshooting](./resources/troubleshooting.md):** Troubleshooting common
  issues.
- **[Uninstall](./resources/uninstall.md):** How to uninstall Gemini CLI.

## Changelog

- **[Release notes](./changelogs/index.md):** The release notes for all
  versions.
- **[Stable release](./changelogs/latest.md):** The latest stable release.
- **[Preview release](./changelogs/preview.md):** The latest preview release.
