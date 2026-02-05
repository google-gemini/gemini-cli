# Gemini CLI documentation

Gemini CLI is an open-source AI agent that brings the power of Gemini models
directly into your terminal. It provides a lightweight, terminal-first interface
for code understanding, automation, and system integration.

## Gemini CLI overview

Gemini CLI enables you to interact with AI using your local project context. By
connecting the reasoning capabilities of Gemini with your file system and shell
environment, the CLI helps you explore codebases, automate complex tasks, and
build AI-powered terminal workflows.

## Navigating the documentation

This documentation is organized into sections to help you get started quickly
and explore the full range of capabilities.

### Get started

The fastest path to setting up and using Gemini CLI.

- **[Overview](docs):** A high-level introduction to the project.
- **[Quickstart](./get-started/index.md):** Your first session with Gemini CLI.
- **[Installation](./get-started/installation.md):** How to install Gemini CLI
  on your system.
- **[Authentication](./get-started/authentication.md):** Setup instructions for
  personal and enterprise accounts.
- **[Examples](./get-started/examples.md):** Practical examples of Gemini CLI in
  action.
- **[Cheatsheet](./cli/cli-reference.md):** A quick reference for common
  commands and options.

### Use Gemini CLI

User-focused guides and tutorials for daily development workflows.

- **[File management](./cli/tutorials/file-management.md):** How to work with
  local files and directories.
- **[Manage context and memory](./cli/tutorials/memory-management.md):**
  Managing persistent instructions and facts.
- **[Execute shell commands](./cli/tutorials/shell-commands.md):** Executing
  system commands safely.
- **[Manage sessions and history](./cli/tutorials/session-management.md):**
  Resuming, managing, and rewinding conversations.
- **[Plan tasks with todos](./cli/tutorials/task-planning.md):** Using todos for
  complex agent workflows.
- **[Web search and fetch](./cli/tutorials/web-tools.md):** Searching and
  fetching content from the web.
- **[Get started with skills](./cli/tutorials/skills-getting-started.md):**
  Getting started with specialized expertise.

### Features

Technical reference documentation for each capability of Gemini CLI.

- **[Activate skill (tool)](./tools/activate-skill.md):** Internal mechanism for
  loading expert procedures.
- **[Agent Skills](./cli/skills.md):** On-demand expertise and workflows.
- **[Ask user (tool)](./tools/ask-user.md):** Internal dialog system for
  clarification.
- **[Checkpointing](./cli/checkpointing.md):** Automatic session snapshots.
- **[Extensions](./extensions/index.md):** Core extensibility framework.
- **[File system (tool)](./tools/file-system.md):** Technical details for local
  file operations.
- **[Headless mode](./cli/headless.md):** Programmatic and scripting usage.
- **[Hooks](./hooks/index.md):** Technical specification for interception
  points.
- **[IDE integration](./ide-integration/index.md):** Architecture for editor
  companions.
- **[Internal documentation (tool)](./tools/internal-docs.md):** Technical
  lookup for CLI features.
- **[MCP servers](./tools/mcp-server.md):** Transport and protocol
  specification.
- **[Memory (tool)](./tools/memory.md):** Storage details for persistent facts.
- **[Model routing](./cli/model-routing.md):** Automatic fallback resilience.
- **[Model selection](./cli/model.md):** Manual and automatic model selection.
- **[Rewind](./cli/rewind.md):** State restoration reference.
- **[Sandboxing](./cli/sandbox.md):** Secure, isolated tool execution.
- **[Shell (tool)](./tools/shell.md):** Detailed system execution parameters.
- **[Telemetry](./cli/telemetry.md):** Usage and performance metric details.
- **[Todo (tool)](./tools/todos.md):** Progress tracking specification.
- **[Token caching](./cli/token-caching.md):** Performance optimization.
- **[Web fetch (tool)](./tools/web-fetch.md):** URL retrieval and extraction
  details.
- **[Web search (tool)](./tools/web-search.md):** Google Search integration
  technicals.

### Configuration

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
- **[Settings](./cli/settings.md):** Full configuration reference.
- **[System prompt override](./cli/system-prompt.md):** Instruction replacement
  logic.
- **[Themes](./cli/themes.md):** UI personalization technical guide.
- **[Trusted folders](./cli/trusted-folders.md):** Security permission logic.

### Reference

Deep technical documentation and API specifications.

- **[Architecture overview](./architecture.md):** System design and components.
- **[Command reference](./cli/commands.md):** Detailed slash command guide.
- **[Configuration reference](./get-started/configuration.md):** Settings and
  environment variables.
- **[Core concepts](./core/concepts.md):** Fundamental terminology and
  definitions.
- **[Keyboard shortcuts](./cli/keyboard-shortcuts.md):** Productivity tips.
- **[Policy engine](./core/policy-engine.md):** Fine-grained execution control.

### Resources

Support, release history, and legal information.

- **[FAQ](./faq.md):** Answers to frequently asked questions.
- **[Changelogs](./changelogs/index.md):** Highlights and notable changes.
- **[Quota and pricing](./quota-and-pricing.md):** Limits and billing details.
- **[Terms and privacy](./tos-privacy.md):** Official notices and terms.
