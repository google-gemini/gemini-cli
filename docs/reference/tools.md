# Tools reference

Gemini CLI uses tools to interact with your local environment, access
information, and perform actions on your behalf. These tools extend the model's
capabilities beyond text generation, letting it read files, execute commands,
and search the web.

The tools are organized into three main categories:

- **Environment tools** let the model interact with your file system, shell, and
  the web.
- **Agent workflow tools** let the executive model manage the conversation flow,
  gather your feedback, and plan complex tasks.
- **Internal coordination tools** let the model manage its own internal state,
  access documentation, or return results from sub-agents.

## Security and confirmation

Every tool has a technical **Kind** (such as `Read`, `Edit`, or `Execute`). This
classification helps the Gemini CLI [Policy Engine](../core/policy-engine.md)
determine security requirements.

- **User confirmation:** You must manually approve tools that modify files or
  execute shell commands (Mutators). The CLI shows you a diff or the exact
  command before you confirm.
- **Sandboxing:** You can run tool executions in secure, containerized
  environments to isolate changes from your host system. For more details, see
  the [Sandboxing](../cli/sandbox.md) guide.
- **Trusted folders:** You can configure which directories allow the model to
  use system tools. For more details, see the
  [Trusted folders](../cli/trusted-folders.md) guide.

Always review confirmation prompts carefully before allowing a tool to execute.

## User-triggered tools

Most of Gemini CLI's tools are triggered by Gemini CLI. There are two tools you
directkly trigger using special syntax:

- **[File access](../tools/file-system.md#read_many_files) (`@`):** Use the `@`
  symbol followed by a file or directory path to include its content in your
  prompt. This triggers the `read_many_files` tool.
- **[Shell commands](../tools/shell.md) (`!`):** Use the `!` symbol followed by
  a system command to execute it directly. This triggers the `run_shell_command`
  tool.

## The `/tools` command

Explore the tools currently available to the Gemini model using the `/tools`
command.

- **`/tools`**: Lists all registered tools with their display names.
- **`/tools desc`**: Lists all tools with their full descriptions as provided to
  the Gemini model.

This command is useful for verifying which tools are active, especially when
using custom tools.

## Environment tools

Environment tools let the model perform actions that directly affect your local
system, such as reading and writing files, executing commands, and searching the
web.

### File system tools

These tools let the model explore and modify your local codebase.

| Tool                                        | Kind     | Parameters                                                                                                     | Description                                                                                          |
| ------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [`list_directory`](../tools/file-system.md) | `Read`   | `dir_path`, `ignore`, `file_filtering_options`                                                                 | Lists the names of files and subdirectories within a specified path.                                 |
| [`read_file`](../tools/file-system.md)      | `Read`   | `file_path`, `offset`, `limit`                                                                                 | Reads the content of a specific file. Supports text, images, audio, and PDF.                         |
| [`write_file`](../tools/file-system.md)     | `Edit`   | `file_path`, `content`                                                                                         | Creates or overwrites a file with new content. Requires manual confirmation.                         |
| [`glob`](../tools/file-system.md)           | `Search` | `pattern`, `dir_path`, `case_sensitive`, `respect_git_ignore`, `respect_gemini_ignore`                         | Finds files matching specific glob patterns across the workspace.                                    |
| [`grep_search`](../tools/file-system.md)    | `Search` | `pattern`, `dir_path`, `include`, `exclude_pattern`, `names_only`, `max_matches_per_file`, `total_max_matches` | Searches for a regular expression pattern within file contents. Legacy alias: `search_file_content`. |
| [`replace`](../tools/file-system.md)        | `Edit`   | `file_path`, `old_string`, `new_string`, `expected_replacements`, `instruction`                                | Performs precise text replacement within a file. Requires manual confirmation.                       |

### Execution tools

The execution tool lets the model run shell commands on your local machine.

| Tool                                     | Kind      | Parameters                                            | Description                                                                                                              |
| ---------------------------------------- | --------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [`run_shell_command`](../tools/shell.md) | `Execute` | `command`, `description`, `dir_path`, `is_background` | Executes arbitrary shell commands. Supports interactive sessions and background processes. Requires manual confirmation. |

### Web tools

Web tools let the model fetch content from URLs and perform web searches.

| Tool                                          | Kind     | Parameters | Description                                              |
| --------------------------------------------- | -------- | ---------- | -------------------------------------------------------- |
| [`web_fetch`](../tools/web-fetch.md)          | `Fetch`  | `prompt`   | Retrieves and processes content from specific URLs.      |
| [`google_web_search`](../tools/web-search.md) | `Search` | `query`    | Performs a Google Search to find up-to-date information. |

## Agent workflow tools

Agent workflow tools let the model interact with you, plan its approach, and
track its progress through multi-step tasks.

| Tool                                      | Kind          | Parameters  | Description                                                                                                  |
| ----------------------------------------- | ------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| [`ask_user`](../tools/ask-user.md)        | `Communicate` | `questions` | Requests clarification or missing information via an interactive dialog.                                     |
| [`enter_plan_mode`](../tools/planning.md) | `Plan`        | `reason`    | Switches the CLI to a safe, read-only "Plan Mode" for researching complex changes.                           |
| [`exit_plan_mode`](../tools/planning.md)  | `Plan`        | `plan`      | Finalizes a plan, presents it for review, and requests approval to start implementation.                     |
| [`write_todos`](../tools/todos.md)        | `Other`       | `todos`     | Maintains an internal list of subtasks. The model uses this to track its own progress and display it to you. |

## Internal coordination tools

Internal coordination tools let the model manage its own internal state, access
its documentation, and handle specialized sub-tasks. These tools usually run
without your direct interaction.

| Tool                                             | Kind    | Parameters                                                                        | Description                                                                                                        |
| ------------------------------------------------ | ------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [`read_many_files`](../tools/file-system.md)     | `Read`  | `include`, `exclude`, `recursive`, `useDefaultExcludes`, `file_filtering_options` | Reads and concatenates content from multiple files. Often triggered by the `@` symbol in your prompt.              |
| [`save_memory`](../tools/memory.md)              | `Think` | `fact`                                                                            | Persists specific facts and project details to your `GEMINI.md` file to retain context across sessions.            |
| [`activate_skill`](../tools/activate-skill.md)   | `Other` | `name`                                                                            | Loads specialized procedural expertise for specific tasks from the `.gemini/skills` directory.                     |
| [`get_internal_docs`](../tools/internal-docs.md) | `Think` | `path`                                                                            | Accesses Gemini CLI's own documentation to provide more accurate answers about its capabilities.                   |
| `complete_task`                                  | `Other` | `result`                                                                          | Finalizes a subagent's mission and returns the result to the parent agent. This tool is not available to the user. |

## Under the hood

For developers, the tool system is designed to be extensible and robust. The
`ToolRegistry` class manages all available tools.

You can extend Gemini CLI with custom tools by configuring a
`tools.discoveryCommand` in your settings or by connecting to MCP servers.

> **Note:** For a deep dive into the internal Tool API and how to implement your
> own tools in the codebase, see the `packages/core/src/tools/` directory.

## Next steps

- Learn how to [Set up an MCP server](../tools/mcp-server.md).
- Explore [Agent Skills](../cli/skills.md) for specialized expertise.
- See the [Command reference](../cli/commands.md) for slash commands.
