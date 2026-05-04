# Tools reference

Gemini CLI uses tools to interact with your local environment, access
information, and perform actions on your behalf. These tools extend the model's
capabilities beyond text generation, letting it read files, execute commands,
and search the web.

## How to use Gemini CLI's tools

Tools are generally invoked automatically by Gemini CLI when it needs to perform
an action. However, you can also trigger specific tools manually using shorthand
syntax.

### Automatic execution and security

When the model wants to use a tool, Gemini CLI evaluates the request against its
security policies.

- **User confirmation:** You must manually approve tools that modify files or
  execute shell commands (mutators). The CLI shows you a diff or the exact
  command before you confirm.
- **Sandboxing:** You can run tool executions in secure, containerized
  environments to isolate changes from your host system. For more details, see
  the [Sandboxing](../cli/sandbox.md) guide.
- **Trusted folders:** You can configure which directories allow the model to
  use system tools. For more details, see the
  [Trusted folders](../cli/trusted-folders.md) guide.

Review confirmation prompts carefully before allowing a tool to execute.

### How to use manually-triggered tools

You can directly trigger key tools using special syntax in your prompt:

- **[File access](../tools/file-system.md#read_many_files) (`@`):** Use the `@`
  symbol followed by a file or directory path to include its content in your
  prompt. This triggers the `read_many_files` tool.
- **[Shell commands](../tools/shell.md) (`!`):** Use the `!` symbol followed by
  a system command to execute it directly. This triggers the `run_shell_command`
  tool.

## How to manage tools

Using built-in commands, you can inspect available tools and configure how they
behave.

### Tool discovery

Use the `/tools` command to see what tools are currently active in your session.

- **`/tools`**: Lists all registered tools with their display names.
- **`/tools desc`**: Lists all tools with their full descriptions.

This is especially useful for verifying that
[MCP servers](../tools/mcp-server.md) or custom tools are loaded correctly.

### Tool configuration

You can enable, disable, or configure specific tools in your settings. For
example, you can set a specific pager for shell commands or configure the
browser used for web searches. See the [Settings](../cli/settings.md) guide for
details.

## Available tools

The following sections list all available tools, categorized by their primary
function. For detailed parameter information, see the linked documentation for
each tool.

### Execution

| Tool                                     | Kind      | Description                                                                                                              |
| :--------------------------------------- | :-------- | :----------------------------------------------------------------------------------------------------------------------- |
| [`run_shell_command`](../tools/shell.md) | `Execute` | Executes arbitrary shell commands. Supports interactive sessions and background processes. Requires manual confirmation. |

### File System

| Tool                                         | Kind     | Description                                                                                           |
| :------------------------------------------- | :------- | :---------------------------------------------------------------------------------------------------- |
| [`glob`](../tools/file-system.md)            | `Search` | Finds files matching specific glob patterns across the workspace.                                     |
| [`grep_search`](../tools/file-system.md)     | `Search` | Searches for a regular expression pattern within file contents. Legacy alias: `search_file_content`.  |
| [`list_directory`](../tools/file-system.md)  | `Read`   | Lists the names of files and subdirectories within a specified path.                                  |
| [`read_file`](../tools/file-system.md)       | `Read`   | Reads the content of a specific file. Supports text, images, audio, and PDF.                          |
| [`read_many_files`](../tools/file-system.md) | `Read`   | Reads and concatenates content from multiple files. Often triggered by the `@` symbol in your prompt. |
| [`replace`](../tools/file-system.md)         | `Edit`   | Performs precise text replacement within a file. Requires manual confirmation.                        |
| [`write_file`](../tools/file-system.md)      | `Edit`   | Creates or overwrites a file with new content. Requires manual confirmation.                          |

### Interaction

| Tool                               | Kind          | Description                                                                            |
| :--------------------------------- | :------------ | :------------------------------------------------------------------------------------- |
| [`ask_user`](../tools/ask-user.md) | `Communicate` | Requests clarification or missing information via an interactive dialog.               |
| [`write_todos`](../tools/todos.md) | `Other`       | Maintains an internal list of subtasks. The model uses this to track its own progress. |

### Task Tracker (Experimental)

<!-- prettier-ignore -->
> [!NOTE]
> This is an experimental feature currently under active development. Enable via `experimental.taskTracker`.

| Tool                                            | Kind    | Description                                                                 |
| :---------------------------------------------- | :------ | :-------------------------------------------------------------------------- |
| [`tracker_create_task`](../tools/tracker.md)    | `Other` | Creates a new task in the experimental tracker.                             |
| [`tracker_update_task`](../tools/tracker.md)    | `Other` | Updates an existing task's status, description, or dependencies.            |
| [`tracker_get_task`](../tools/tracker.md)       | `Other` | Retrieves the full details of a specific task.                              |
| [`tracker_list_tasks`](../tools/tracker.md)     | `Other` | Lists tasks in the tracker, optionally filtered by status, type, or parent. |
| [`tracker_add_dependency`](../tools/tracker.md) | `Other` | Adds a dependency between two tasks, ensuring topological execution.        |
| [`tracker_visualize`](../tools/tracker.md)      | `Other` | Renders an ASCII tree visualization of the current task graph.              |

### MCP

| Tool                                              | Kind     | Description                                                            |
| :------------------------------------------------ | :------- | :--------------------------------------------------------------------- |
| [`list_mcp_resources`](../tools/mcp-resources.md) | `Search` | Lists all available resources exposed by connected MCP servers.        |
| [`read_mcp_resource`](../tools/mcp-resources.md)  | `Read`   | Reads the content of a specific Model Context Protocol (MCP) resource. |

### Memory

| Tool                                             | Kind    | Description                                                                          |
| :----------------------------------------------- | :------ | :----------------------------------------------------------------------------------- |
| [`activate_skill`](../tools/activate-skill.md)   | `Other` | Loads specialized procedural expertise from the `.gemini/skills` directory.          |
| [`get_internal_docs`](../tools/internal-docs.md) | `Think` | Accesses Gemini CLI's own documentation for accurate answers about its capabilities. |
| [`save_memory`](../tools/memory.md)              | `Think` | Persists specific facts and project details to your `GEMINI.md` file.                |

### Planning

| Tool                                      | Kind   | Description                                                                              |
| :---------------------------------------- | :----- | :--------------------------------------------------------------------------------------- |
| [`enter_plan_mode`](../tools/planning.md) | `Plan` | Switches the CLI to a safe, read-only "Plan Mode" for researching complex changes.       |
| [`exit_plan_mode`](../tools/planning.md)  | `Plan` | Finalizes a plan, presents it for review, and requests approval to start implementation. |

### System

| Tool            | Kind    | Description                                                                                                        |
| :-------------- | :------ | :----------------------------------------------------------------------------------------------------------------- |
| `complete_task` | `Other` | Finalizes a subagent's mission and returns the result to the parent agent. This tool is not available to the user. |

### Task Tracking

| Tool                     | Kind    | Description                                                                 |
| :----------------------- | :------ | :-------------------------------------------------------------------------- |
| `tracker_add_dependency` | `Think` | Adds a dependency between two existing tasks in the tracker.                |
| `tracker_create_task`    | `Think` | Creates a new task in the internal tracker to monitor progress.             |
| `tracker_get_task`       | `Think` | Retrieves the details and current status of a specific tracked task.        |
| `tracker_list_tasks`     | `Think` | Lists all tasks currently being tracked.                                    |
| `tracker_update_task`    | `Think` | Updates the status or details of an existing task.                          |
| `tracker_visualize`      | `Think` | Generates a visual representation of the current task dependency graph.     |
| `update_topic`           | `Think` | Updates the current topic and status to keep the user informed of progress. |

### Web

| Tool                                          | Kind     | Description                                                                                                                                                                                                                                                                     |
| :-------------------------------------------- | :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`google_web_search`](../tools/web-search.md) | `Search` | Performs a Google Search to find up-to-date information.                                                                                                                                                                                                                        |
| [`web_fetch`](../tools/web-fetch.md)          | `Fetch`  | Retrieves and processes content from specific URLs. **Warning:** This tool can access local and private network addresses (for example, localhost), which may pose a security risk if used with untrusted prompts. In Plan Mode, this tool requires explicit user confirmation. |

### Tool argument keys

When writing [`argsPattern`](./policy-engine.md#arguments-pattern) rules for the
[policy engine](./policy-engine.md), you need to know the JSON argument keys for
each tool. The following table lists the keys that appear in the JSON
representation of each tool's arguments.

| Tool                     | JSON argument keys                                                                                                                                                                                   |
| :----------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run_shell_command`      | `command`, `description`, `dir_path`, `is_background`                                                                                                                                                |
| `glob`                   | `pattern`, `dir_path`, `case_sensitive`, `respect_git_ignore`, `respect_gemini_ignore`                                                                                                               |
| `grep_search`            | `pattern`, `dir_path`, `include_pattern`, `exclude_pattern`, `names_only`, `case_sensitive`, `fixed_strings`, `context`, `after`, `before`, `no_ignore`, `max_matches_per_file`, `total_max_matches` |
| `list_directory`         | `dir_path`, `ignore`, `file_filtering_options`                                                                                                                                                       |
| `read_file`              | `file_path`, `start_line`, `end_line`                                                                                                                                                                |
| `read_many_files`        | `include`, `exclude`, `recursive`, `useDefaultExcludes`                                                                                                                                              |
| `write_file`             | `file_path`, `content`                                                                                                                                                                               |
| `replace`                | `file_path`, `old_string`, `new_string`, `instruction`, `allow_multiple`                                                                                                                             |
| `ask_user`               | `questions` (array of `question`, `header`, `type`, `options`)                                                                                                                                       |
| `write_todos`            | `todos` (array of `description`, `status`)                                                                                                                                                           |
| `save_memory`            | `fact`                                                                                                                                                                                               |
| `activate_skill`         | `name`                                                                                                                                                                                               |
| `get_internal_docs`      | `path`                                                                                                                                                                                               |
| `enter_plan_mode`        | `reason`                                                                                                                                                                                             |
| `exit_plan_mode`         | `plan_path`                                                                                                                                                                                          |
| `tracker_create_task`    | `title`, `description`, `type`                                                                                                                                                                       |
| `tracker_update_task`    | `id`, `title`, `description`, `status`, `dependencies`                                                                                                                                               |
| `tracker_get_task`       | `id`                                                                                                                                                                                                 |
| `tracker_list_tasks`     | `status`, `type`, `parentId`                                                                                                                                                                         |
| `tracker_add_dependency` | `taskId`, `dependencyId`                                                                                                                                                                             |
| `tracker_visualize`      | _(none)_                                                                                                                                                                                             |
| `update_topic`           | `title`, `summary`, `strategic_intent`                                                                                                                                                               |
| `google_web_search`      | `query`                                                                                                                                                                                              |
| `web_fetch`              | `prompt`                                                                                                                                                                                             |

For example, to write a policy rule that blocks any `write_file` call targeting
a `.env` file, you would match against the `file_path` key:

```toml
[[rule]]
toolName = "write_file"
argsPattern = '"file_path":".*\.env"'
decision = "deny"
priority = 100
denyMessage = "Writing to .env files is not allowed."
```

For full argument descriptions and types, see the individual tool pages linked
in the [tables above](#available-tools).

## Under the hood

For developers, the tool system is designed to be extensible and robust. The
`ToolRegistry` class manages all available tools.

You can extend Gemini CLI with custom tools by configuring
`tools.discoveryCommand` in your settings or by connecting to MCP servers.

<!-- prettier-ignore -->
> [!NOTE]
> For a deep dive into the internal Tool API and how to implement your
> own tools in the codebase, see the `packages/core/src/tools/` directory in
> GitHub.

## Next steps

- Learn how to [Set up an MCP server](../tools/mcp-server.md).
- Explore [Agent Skills](../cli/skills.md) for specialized expertise.
- See the [Command reference](./commands.md) for slash commands.
