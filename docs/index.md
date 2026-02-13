# Gemini CLI documentation

Gemini CLI is an open-source AI agent that brings the power of Gemini directly
into your terminal. It is designed to be a terminal-first, extensible, and
powerful tool for developers, engineers, SREs, and beyond.

Gemini CLI integrates with your local environment. It can read and edit files,
execute shell commands, and search the web, all while maintaining your project
context.

## Get started

Begin your journey with Gemini CLI by setting up your environment and learning
the basics.

- **[Quickstart](./get-started/index.md):** A streamlined guide to get you
  chatting in minutes.
- **[Installation](./get-started/installation.md):** Instructions for macOS,
  Linux, and Windows.
- **[Authentication](./get-started/authentication.md):** Set up access using
  Google OAuth, API keys, or Vertex AI.
- **[Examples](./get-started/examples.md):** View common usage scenarios to
  inspire your own workflows.

## Use Gemini CLI

Master the core capabilities that let Gemini CLI interact with your system
safely and effectively.

- **[Using the CLI](./cli/index.md):** Learn the basics of the command-line
  interface.
- **[File management](./tools/file-system.md):** Grant the model the ability to
  read code and apply changes directly to your files.
- **[Shell commands](./tools/shell.md):** Allow the model to run builds, tests,
  and git commands.
- **[Memory management](./tools/memory.md):** Teach Gemini CLI facts about your
  project and preferences that persist across sessions.
- **[Project context](./cli/gemini-md.md):** Use `GEMINI.md` files to provide
  persistent context for your projects.
- **[Web search and fetch](./tools/web-search.md):** Enable the model to fetch
  real-time information from the internet.
- **[Session management](./cli/session-management.md):** Save, resume, and
  organize your chat sessions.

## Configuration

Customize Gemini CLI to match your workflow and preferences.

- **[Settings](./cli/settings.md):** Control response creativity, output
  verbosity, and more.
- **[Model selection](./cli/model.md):** Choose the best Gemini model for your
  specific task.
- **[Ignore files](./cli/gemini-ignore.md):** Use `.geminiignore` to keep
  sensitive files out of the model's context.
- **[Trusted folders](./cli/trusted-folders.md):** Define security boundaries
  for file access and execution.
- **[Token caching](./cli/token-caching.md):** Optimize performance and cost by
  caching context.
- **[Themes](./cli/themes.md):** Personalize the visual appearance of the CLI.

## Advanced features

Explore powerful features for complex workflows and enterprise environments.

- **[Headless mode](./cli/headless.md):** Run Gemini CLI in scripts or CI/CD
  pipelines for automated reasoning.
- **[Sandboxing](./cli/sandbox.md):** Execute untrusted code or tools in a
  secure, isolated container.
- **[Checkpointing](./cli/checkpointing.md):** Save and restore workspace state
  to recover from experimental changes.
- **[Custom commands](./cli/custom-commands.md):** Create shortcuts for
  frequently used prompts.
- **[System prompt override](./cli/system-prompt.md):** Customize the core
  instructions given to the model.
- **[Telemetry](./cli/telemetry.md):** Understand how usage data is collected
  and managed.
- **[Enterprise](./cli/enterprise.md):** Manage configurations and policies for
  large teams.

## Extensions

Extend Gemini CLI's capabilities with new tools and behaviors using extensions.

- **[Introduction](./extensions/index.md):** Learn about the extension system
  and how to manage extensions.
- **[Writing extensions](./extensions/writing-extensions.md):** Learn how to
  create your first extension.
- **[Extensions reference](./extensions/reference.md):** Deeply understand the
  extension format, commands, and configuration.
- **[Best practices](./extensions/best-practices.md):** Learn strategies for
  building great extensions.
- **[Extensions releasing](./extensions/releasing.md):** Learn how to share your
  extensions with the world.

## Ecosystem and extensibility

Connect Gemini CLI to external services and other development tools.

- **[MCP servers](./tools/mcp-server.md):** Connect to external services using
  the Model Context Protocol.
- **[IDE integration](./ide-integration/index.md):** Use Gemini CLI alongside VS
  Code.
- **[Hooks](./hooks/index.md):** Write scripts that run on specific CLI events.
- **[Agent skills](./cli/skills.md):** Add specialized expertise and workflows.
- **[Sub-agents](./core/subagents.md):** (Preview) Delegate tasks to specialized
  agents.

## Development and reference

Deep dive into the architecture and contribute to the project.

- **[Architecture](./architecture.md):** Understand the technical design of
  Gemini CLI.
- **[Command reference](./cli/commands.md):** A complete list of available
  commands.
- **[Local development](./local-development.md):** Set up your environment to
  contribute to Gemini CLI.
- **[Contributing](../CONTRIBUTING.md):** Learn how to submit pull requests and
  report issues.
- **[FAQ](./faq.md):** Answers to common questions.
- **[Troubleshooting](./troubleshooting.md):** Solutions for common issues.
