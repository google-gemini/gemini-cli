# Welcome to Gemini CLI documentation

This documentation provides a comprehensive guide to installing, using, and
developing Gemini CLI, a tool that lets you interact with Gemini models through
a command-line interface.

## Gemini CLI overview

Gemini CLI brings the capabilities of Gemini models to your terminal in an
interactive Read-Eval-Print Loop (REPL) environment. Gemini CLI consists of a
client-side application (`packages/cli`) that communicates with a local server
(`packages/core`), which in turn manages requests to the Gemini API and its AI
models. Gemini CLI also contains a variety of tools for tasks such as performing
file system operations, running shells, and web fetching, which are managed by
`packages/core`.

## Navigating the documentation

This documentation is organized into the following sections:

### Overview

- **[Architecture overview](./architecture.md):** Understand the high-level
  design of Gemini CLI, including its components and how they interact.
- **[Contribution guide](../CONTRIBUTING.md):** Information for contributors and
  developers, including setup, building, testing, and coding conventions.

### Get started

- **[Gemini CLI quickstart](./get-started/index.md):** Let's get started with
  Gemini CLI.
- **[Gemini 3 Pro on Gemini CLI](./get-started/gemini-3.md):** Learn how to
  enable and use Gemini 3.
- **[Authentication](./get-started/authentication.md):** Authenticate to Gemini
  CLI.
- **[Configuration](./get-started/configuration.md):** Learn how to configure
  the CLI.
- **[Installation](./get-started/installation.md):** Install and run Gemini CLI.
- **[Examples](./get-started/examples.md):** Example usage of Gemini CLI.

### CLI

- **[Introduction: Gemini CLI](./cli/index.md):** Overview of the command-line
  interface.
- **[Commands](./cli/commands.md):** Description of available CLI commands.
- **[Checkpointing](./cli/checkpointing.md):** Documentation for the
  checkpointing feature.
- **[Custom commands](./cli/custom-commands.md):** Create your own commands and
  shortcuts for frequently used prompts.
- **[Enterprise](./cli/enterprise.md):** Gemini CLI for enterprise.
- **[Headless mode](./cli/headless.md):** Use Gemini CLI programmatically for
  scripting and automation.
- **[Keyboard shortcuts](./cli/keyboard-shortcuts.md):** A reference for all
  keyboard shortcuts to improve your workflow.
- **[Model selection](./cli/model.md):** Select the model used to process your
  commands with `/model`.
- **[Sandbox](./cli/sandbox.md):** Isolate tool execution in a secure,
  containerized environment.
- **[Settings](./cli/settings.md):** Configure various aspects of the CLI's
  behavior and appearance with `/settings`.
- **[Telemetry](./cli/telemetry.md):** Overview of telemetry in the CLI.
- **[Themes](./cli/themes.md):** Themes for Gemini CLI.
- **[Token caching](./cli/token-caching.md):** Token caching and optimization.
- **[Trusted Folders](./cli/trusted-folders.md):** An overview of the Trusted
  Folders security feature.
- **[Tutorials](./cli/tutorials.md):** Tutorials for Gemini CLI.
- **[Uninstall](./cli/uninstall.md):** Methods for uninstalling the Gemini CLI.

### Core

- **[Introduction: Gemini CLI core](./core/index.md):** Information about Gemini
  CLI core.
- **[Memport](./core/memport.md):** Using the Memory Import Processor.
- **[Tools API](./core/tools-api.md):** Information on how the core manages and
  exposes tools.
- **[System Prompt Override](./cli/system-prompt.md):** Replace built-in system
  instructions using `GEMINI_SYSTEM_MD`.

- **[Policy Engine](./core/policy-engine.md):** Use the Policy Engine for
  fine-grained control over tool execution.

### Tools

- **[Introduction: Gemini CLI tools](./tools/index.md):** Information about
  Gemini CLI's tools.
- **[File system tools](./tools/file-system.md):** Documentation for the
  `read_file` and `write_file` tools.
- **[Shell tool](./tools/shell.md):** Documentation for the `run_shell_command`
  tool.
- **[Web fetch tool](./tools/web-fetch.md):** Documentation for the `web_fetch`
  tool.
- **[Web search tool](./tools/web-search.md):** Documentation for the
  `google_web_search` tool.
- **[Memory tool](./tools/memory.md):** Documentation for the `save_memory`
  tool.
- **[Todo tool](./tools/todos.md):** Documentation for the `write_todos` tool.
- **[MCP servers](./tools/mcp-server.md):** Using MCP servers with Gemini CLI.

### Extensions

- **[Introduction: Extensions](./extensions/index.md):** How to extend the CLI
  with new functionality.
- **[Get Started with extensions](./extensions/getting-started-extensions.md):**
  Learn how to build your own extension.
- **[Extension releasing](./extensions/extension-releasing.md):** How to release
  Gemini CLI extensions.

### Hooks

- **[Hooks](./hooks/index.md):** Intercept and customize Gemini CLI behavior at
  key lifecycle points.
- **[Writing Hooks](./hooks/writing-hooks.md):** Learn how to create your first
  hook with a comprehensive example.
- **[Best Practices](./hooks/best-practices.md):** Security, performance, and
  debugging guidelines for hooks.

### IDE integration

- **[Introduction to IDE integration](./ide-integration/index.md):** Connect the
  CLI to your editor.
- **[IDE companion extension spec](./ide-integration/ide-companion-spec.md):**
  Spec for building IDE companion extensions.

### Development

- **[NPM](./npm.md):** Details on how the project's packages are structured.
- **[Releases](./releases.md):** Information on the project's releases and
  deployment cadence.
- **[Changelog](./changelogs/index.md):** Highlights and notable changes to
  Gemini CLI.
- **[Integration tests](./integration-tests.md):** Information about the
  integration testing framework used in this project.
- **[Issue and PR automation](./issue-and-pr-automation.md):** A detailed
  overview of the automated processes we use to manage and triage issues and
  pull requests.

### Support

- **[FAQ](./faq.md):** Frequently asked questions.
- **[Troubleshooting guide](./troubleshooting.md):** Find solutions to common
  problems.
- **[Quota and pricing](./quota-and-pricing.md):** Learn about the free tier and
  paid options.
- **[Terms of service and privacy notice](./tos-privacy.md):** Information on
  the terms of service and privacy notices applicable to your use of Gemini CLI.

We hope this documentation helps you make the most of Gemini CLI!
