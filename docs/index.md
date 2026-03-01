# Gemini CLI documentation

Gemini CLI brings the power of Gemini models directly into your terminal. Use it
to understand code, automate tasks, and build workflows with your local project
context.

## Install

```bash
npm install -g @google/gemini-cli
```

## Get started

Jump in to Gemini CLI.

- **[Quickstart](./get-started/index.md):** Your first session with Gemini CLI.
- **[Installation](./get-started/installation.md):** How to install Gemini CLI
  on your system.
- **[Authentication](./get-started/authentication.md):** Setup instructions for
  personal and enterprise accounts.
- **[Examples](./get-started/examples.md):** Practical examples of Gemini CLI in
  action.
- **[CLI cheatsheet](./cli/cli-reference.md):** A quick reference for common
  commands and options.
- **[Gemini 3 on Gemini CLI](./get-started/gemini-3.md):** Learn about Gemini 3
  support in Gemini CLI.

## Use Gemini CLI

User-focused guides and tutorials for daily development workflows.

- **[File management](./cli/tutorials/file-management.md):** How to work with
  local files and directories.
- **[Get started with Agent skills](./cli/tutorials/skills-getting-started.md):**
  Getting started with specialized expertise.
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
- **[Set up an MCP server](./cli/tutorials/mcp-setup.md):** Set up an MCP
  server.
- **[Automate tasks](./cli/tutorials/automation.md):** Automate tasks.

## Features

Technical documentation for each capability of Gemini CLI.

- **[Extensions](./extensions/index.md):** Extend Gemini CLI with new tools and
  capabilities.
- **[Agent Skills](./cli/skills.md):** Use specialized agents for specific
  tasks.
- **[Checkpointing](./cli/checkpointing.md):** Automatic session snapshots.
- **[Headless mode](./cli/headless.md):** Programmatic and scripting interface.
- **[Hooks](./hooks/index.md):** Customize Gemini CLI behavior with scripts.
- **[IDE integration](./ide-integration/index.md):** Integrate Gemini CLI with
  your favorite IDE.
- **[MCP servers](./tools/mcp-server.md):** Connect to and use remote agents.
- **[Model routing](./cli/model-routing.md):** Automatic fallback resilience.
- **[Model selection](./cli/model.md):** Choose the best model for your needs.
- **[Plan mode 🔬](./cli/plan-mode.md):** Use a safe, read-only mode for
  planning complex changes.
- **[Subagents 🔬](./core/subagents.md):** Using specialized agents for specific
  tasks.
- **[Remote subagents 🔬](./core/remote-agents.md):** Connecting to and using
  remote agents.
- **[Rewind](./cli/rewind.md):** Rewind and replay sessions.
- **[Sandboxing](./cli/sandbox.md):** Isolate tool execution.
- **[Settings](./cli/settings.md):** Full configuration reference.
- **[Telemetry](./cli/telemetry.md):** Usage and performance metric details.
- **[Token caching](./cli/token-caching.md):** Performance optimization.

## Configuration

Settings and customization options for Gemini CLI.

- **[Custom commands](./cli/custom-commands.md):** Personalized shortcuts.
- **[Enterprise configuration](./cli/enterprise.md):** Professional environment
  controls.
- **[Ignore files (.geminiignore)](./cli/gemini-ignore.md):** Exclusion pattern
  reference.
- **[Model configuration](./cli/generation-settings.md):** Fine-tune generation
  parameters like temperature and thinking budget.
- **[Project context (GEMINI.md)](./cli/gemini-md.md):** Technical hierarchy of
  context files.
- **[System prompt override](./cli/system-prompt.md):** Instruction replacement
  logic.
- **[Themes](./cli/themes.md):** UI personalization technical guide.
- **[Trusted folders](./cli/trusted-folders.md):** Security permission logic.

## Reference

Deep technical documentation and API specifications.

- **[Command reference](./reference/commands.md):** Detailed slash command
  guide.
- **[Configuration reference](./reference/configuration.md):** Settings and
  environment variables.
- **[Keyboard shortcuts](./reference/keyboard-shortcuts.md):** Productivity
  tips.
- **[Memory import processor](./reference/memport.md):** How Gemini CLI
  processes memory from various sources.
- **[Policy engine](./reference/policy-engine.md):** Fine-grained execution
  control.
- **[Tools API](./reference/tools-api.md):** The API for defining and using
  tools.

## Resources

Support, release history, and legal information.

- **[FAQ](./resources/faq.md):** Answers to frequently asked questions.
- **[Quota and pricing](./resources/quota-and-pricing.md):** Limits and billing
  details.
- **[Terms and privacy](./resources/tos-privacy.md):** Official notices and
  terms.
- **[Troubleshooting](./resources/troubleshooting.md):** Common issues and
  solutions.
- **[Uninstall](./resources/uninstall.md):** How to uninstall Gemini CLI.

## Development

- **[Contribution guide](/docs/contributing):** How to contribute to Gemini CLI.
- **[Integration testing](./integration-tests.md):** Running integration tests.
- **[Issue and PR automation](./issue-and-pr-automation.md):** Automation for
  issues and pull requests.
- **[Local development](./local-development.md):** Setting up a local
  development environment.
- **[NPM package structure](./npm.md):** The structure of the NPM packages.

## Releases

- **[Release notes](./changelogs/index.md):** Release notes for all versions.
- **[Stable release](./changelogs/latest.md):** The latest stable release.
- **[Preview release](./changelogs/preview.md):** The latest preview release.
