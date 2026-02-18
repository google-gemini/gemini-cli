# Using Gemini CLI

Gemini CLI is a terminal-first interface that brings the power of Gemini AI
models directly into your development workflow. It lets you interact with AI
using your local files, shell environment, and project context, creating a
bridge between generative AI and your system tools.

## User guides

These guides provide step-by-step instructions and practical examples for using
Gemini CLI in your daily development workflow.

- **[Quickstart](../get-started/index.md):** Get up and running with Gemini CLI
  in minutes.
- **[Examples](../get-started/examples.md):** See practical examples of Gemini
  CLI in action.
- **[Get started with skills](./tutorials/skills-getting-started.md):** Learn
  how to use and manage specialized expertise.
- **[File management](./tutorials/file-management.md):** How to include, search,
  and modify local files.
- **[Set up an MCP server](./tutorials/mcp-setup.md):** Configure Model Context
  Protocol servers for custom tools.
- **[Manage context and memory](./tutorials/memory-management.md):** Manage
  persistent instructions and individual facts.
- **[Manage sessions and history](./tutorials/session-management.md):** Resume,
  manage, and rewind your conversations.
- **[Execute shell commands](./tutorials/shell-commands.md):** Execute system
  commands safely directly from your prompt.
- **[Plan tasks with todos](./tutorials/task-planning.md):** Using todos for
  complex, multi-step agent requests.
- **[Web search and fetch](./tutorials/web-tools.md):** Searching and fetching
  content from the web.

## Features

Technical reference documentation for each capability of Gemini CLI.

- **[/about](../cli/commands.md#about):** Show version info.
- **[/auth](../cli/commands.md#auth):** Change authentication method.
- **[/bug](../cli/commands.md#bug):** File an issue about Gemini CLI.
- **[/chat](../cli/commands.md#chat):** Save and resume conversation history.
- **[/clear](../cli/commands.md#clear):** Clear the terminal screen.
- **[/compress](../cli/commands.md#compress):** Replace context with a summary.
- **[/copy](../cli/commands.md#copy):** Copy output to clipboard.
- **[/directory](../cli/commands.md#directory-or-dir):** Manage workspace
  directories.
- **[/docs](../cli/commands.md#docs):** Open documentation in browser.
- **[/editor](../cli/commands.md#editor):** Select preferred editor.
- **[/extensions](../cli/commands.md#extensions):** List active extensions.
- **[/help](../cli/commands.md#help-or):** Display help information.
- **[/hooks](../hooks/index.md):** Manage hooks for lifecycle events.
- **[/ide](../ide-integration/index.md):** Manage IDE integration.
- **[/init](../cli/commands.md#init):** Create a GEMINI.md context file.
- **[/mcp](../tools/mcp-server.md):** Manage Model Context Protocol servers.
- **[/memory](../cli/commands.md#memory):** Manage instructional context.
- **[/model](./model.md):** Choose Gemini model.
- **[/policies](../cli/commands.md#policies):** Manage security policies.
- **[/privacy](../cli/commands.md#privacy):** Display privacy notice.
- **[/quit](../cli/commands.md#quit-or-exit):** Exit Gemini CLI.
- **[/restore](../cli/commands.md#restore):** Restore file state.
- **[/resume](../cli/commands.md#resume):** Browse and resume sessions.
- **[/rewind](./rewind.md):** Navigate backward through history.
- **[/settings](./settings.md):** Open settings editor.
- **[/setup-github](../cli/commands.md#setup-github):** Set up GitHub Actions.
- **[/shells](../cli/commands.md#shells-or-bashes):** Toggle background shells
  view.
- **[/skills](./skills.md):** Manage Agent Skills.
- **[/stats](../cli/commands.md#stats):** Display session statistics.
- **[/terminal-setup](../cli/commands.md#terminal-setup):** Configure
  keybindings.
- **[/theme](./themes.md):** Change visual theme.
- **[/tools](../cli/commands.md#tools):** Display list of available tools.
- **[/vim](../cli/commands.md#vim):** Toggle vim mode.
- **[Activate skill (tool)](../tools/activate-skill.md):** Internal mechanism
  for loading expert procedures.
- **[Ask user (tool)](../tools/ask-user.md):** Internal dialog system for
  clarification.
- **[Checkpointing](./checkpointing.md):** Automatic session snapshots.
- **[File system (tool)](../tools/file-system.md):** Technical details for local
  file operations.
- **[Headless mode](./headless.md):** Programmatic and scripting interface.
- **[Internal documentation (tool)](../tools/internal-docs.md):** Technical
  lookup for CLI features.
- **[Memory (tool)](../tools/memory.md):** Storage details for persistent facts.
- **[Model routing](./model-routing.md):** Automatic fallback resilience.
- **[Plan mode (experimental)](./plan-mode.md):** Use a safe, read-only mode for
  planning complex changes.
- **[Sandboxing](./sandbox.md):** Isolate tool execution.
- **[Shell (tool)](../tools/shell.md):** Detailed system execution parameters.
- **[Telemetry](./telemetry.md):** Usage and performance metric details.
- **[Todo (tool)](../tools/todos.md):** Progress tracking specification.
- **[Token caching](./token-caching.md):** Performance optimization.
- **[Web fetch (tool)](../tools/web-fetch.md):** URL retrieval and extraction
  details.
- **[Web search (tool)](../tools/web-search.md):** Google Search integration
  technicals.

## Configuration

Settings and customization options for Gemini CLI.

- **[Custom commands](./custom-commands.md):** Personalized shortcuts.
- **[Enterprise configuration](./enterprise.md):** Professional environment
  controls.
- **[Ignore files (.geminiignore)](./gemini-ignore.md):** Exclusion pattern
  reference.
- **[Model configuration](./generation-settings.md):** Fine-tune generation
  parameters like temperature and thinking budget.
- **[Project context (GEMINI.md)](./gemini-md.md):** Technical hierarchy of
  context files.
- **[Settings](./settings.md):** Full `settings.json` schema.
- **[System prompt override](./system-prompt.md):** Instruction replacement
  logic.
- **[Themes](./themes.md):** UI personalization technical guide.
- **[Trusted folders](./trusted-folders.md):** Security permission logic.

## Next steps

- Explore the [Command reference](./commands.md) to learn about all available
  slash commands.
- Read about [Project context](./gemini-md.md) to understand how to provide
  persistent instructions to the model.
- See the [CLI reference](./cli-reference.md) for a quick cheatsheet of flags.
