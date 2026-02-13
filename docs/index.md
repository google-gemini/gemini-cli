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
- **[Cheatsheet](./cli/cli-reference.md):** A quick reference for common
  commands and options.

## Use Gemini CLI

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
  complex workflows.
- **[Web search and fetch](./cli/tutorials/web-tools.md):** Searching and
  fetching content from the web.
- **[Get started with skills](./cli/tutorials/skills-getting-started.md):**
  Getting started with specialized expertise.

## Features

Technical reference documentation for each capability of Gemini CLI.

- **[/about](./cli/commands.md#about):** About Gemini CLI.
- **[/auth](./get-started/authentication.md):** Authentication.
- **[/bug](./cli/commands.md#bug):** Report a bug.
- **[/chat](./cli/commands.md#chat):** Chat history.
- **[/clear](./cli/commands.md#clear):** Clear screen.
- **[/compress](./cli/commands.md#compress):** Compress context.
- **[/copy](./cli/commands.md#copy):** Copy output.
- **[/directory](./cli/commands.md#directory-or-dir):** Manage workspace.
- **[/docs](./cli/commands.md#docs):** Open documentation.
- **[/editor](./cli/commands.md#editor):** Select editor.
- **[/extensions](./extensions/index.md):** Manage extensions.
- **[/help](./cli/commands.md#help-or):** Show help.
- **[/hooks](./hooks/index.md):** Hooks.
- **[/ide](./ide-integration/index.md):** IDE integration.
- **[/init](./cli/commands.md#init):** Initialize context.
- **[/mcp](./tools/mcp-server.md):** MCP servers.
- **[/memory](./cli/commands.md#memory):** Manage memory.
- **[/model](./cli/model.md):** Model selection.
- **[/policies](./cli/commands.md#policies):** Manage policies.
- **[/privacy](./cli/commands.md#privacy):** Privacy notice.
- **[/quit](./cli/commands.md#quit-or-exit):** Exit CLI.
- **[/restore](./cli/checkpointing.md):** Restore files.
- **[/resume](./cli/commands.md#resume):** Resume session.
- **[/rewind](./cli/rewind.md):** Rewind.
- **[/settings](./cli/settings.md):** Settings.
- **[/setup-github](./cli/commands.md#setup-github):** GitHub setup.
- **[/shells](./cli/commands.md#shells-or-bashes):** Manage processes.
- **[/skills](./cli/skills.md):** Agent skills.
- **[/stats](./cli/commands.md#stats):** Session statistics.
- **[/terminal-setup](./cli/commands.md#terminal-setup):** Terminal keybindings.
- **[/theme](./cli/themes.md):** Themes.
- **[/tools](./cli/commands.md#tools):** List tools.
- **[/vim](./cli/commands.md#vim):** Vim mode.
- **[Activate skill (tool)](./tools/activate-skill.md):** Internal mechanism for
  loading expert procedures.
- **[Ask user (tool)](./tools/ask-user.md):** Internal dialog system for
  clarification.
- **[Checkpointing](./cli/checkpointing.md):** Automatic session snapshots.
- **[File system (tool)](./tools/file-system.md):** Technical details for local
  file operations.
- **[Headless mode](./cli/headless.md):** Programmatic and scripting interface.
- **[Internal documentation (tool)](./tools/internal-docs.md):** Technical
  lookup for CLI features.
- **[Memory (tool)](./tools/memory.md):** Storage details for persistent facts.
- **[Model routing](./cli/model-routing.md):** Automatic fallback resilience.
- **[Plan mode (experimental)](./cli/plan-mode.md):** Use a safe, read-only mode
  for planning complex changes.
- **[Sandboxing](./cli/sandbox.md):** Isolate tool execution.
- **[Shell (tool)](./tools/shell.md):** Detailed system execution parameters.
- **[Telemetry](./cli/telemetry.md):** Usage and performance metric details.
- **[Todo (tool)](./tools/todos.md):** Progress tracking specification.
- **[Token caching](./cli/token-caching.md):** Performance optimization.
- **[Web fetch (tool)](./tools/web-fetch.md):** URL retrieval and extraction
  details.
- **[Web search (tool)](./tools/web-search.md):** Google Search integration
  technicals.

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
- **[Settings](./cli/settings.md):** Full configuration reference.
- **[System prompt override](./cli/system-prompt.md):** Instruction replacement
  logic.
- **[Themes](./cli/themes.md):** UI personalization technical guide.
- **[Trusted folders](./cli/trusted-folders.md):** Security permission logic.

## Reference

Deep technical documentation and API specifications.

- **[Architecture overview](./architecture.md):** System design and components.
- **[Command reference](./cli/commands.md):** Detailed slash command guide.
- **[Configuration reference](./get-started/configuration.md):** Settings and
  environment variables.
- **[Core concepts](./core/concepts.md):** Fundamental terminology and
  definitions.
- **[Keyboard shortcuts](./cli/keyboard-shortcuts.md):** Productivity tips.
- **[Policy engine](./core/policy-engine.md):** Fine-grained execution control.

## Resources

Support, release history, and legal information.

- **[FAQ](./faq.md):** Answers to frequently asked questions.
- **[Changelogs](./changelogs/index.md):** Highlights and notable changes.
- **[Quota and pricing](./quota-and-pricing.md):** Limits and billing details.
- **[Terms and privacy](./tos-privacy.md):** Official notices and terms.
