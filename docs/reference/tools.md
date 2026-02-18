# Tools reference

Gemini CLI uses tools to interact with your local environment, access
information, and perform actions on your behalf. These tools extend the model's
capabilities beyond text generation, letting it read files, execute commands,
and search the web.

## Internal tools

Internal tools are the bridge between the Gemini model and your local
environment. When you interact with Gemini CLI, the model can request to use one
or more of these tools to fulfill your request.

Every tool has a technical **Kind** (such as `Read`, `Edit`, or `Execute`). This
classification helps the Gemini CLI [Policy Engine](../core/policy-engine.md)
determine security requirements. Tools categorized as **Mutators** (such as
`Edit` and `Execute`) typically require your manual confirmation before they
run, as they can modify your system or files.

The tools are organized into three main categories:

- **Environment tools** let the model interact with your file system, shell, and
  the web.
- **Agent workflow tools** let the executive model manage the conversation flow,
  gather your feedback, and plan complex tasks.
- **Internal coordination tools** let the model manage its own internal state,
  access documentation, or return results from sub-agents.

## The `/tools` command

Explore the tools currently available to the Gemini model using the `/tools`
command.

- **`/tools`**: Lists all registered tools with their display names.
- **`/tools desc`**: Lists all tools with their full descriptions as provided to
  the Gemini model.

This command is useful for verifying which tools are active, especially when
using custom tools via [MCP servers](../tools/mcp-server.md) or
[extensions](../extensions/index.md).

## Environment tools

Environment tools let the model perform actions that directly affect your local
system, such as reading and writing files, executing commands, and searching the
web.

### File system tools

These tools let the model explore and modify your local codebase.

| Tool             | Kind     | Parameters                                                                                                     | Description                                                                                          |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `list_directory` | `Read`   | `dir_path`, `ignore`, `file_filtering_options`                                                                 | Lists the names of files and subdirectories within a specified path.                                 |
| `read_file`      | `Read`   | `file_path`, `offset`, `limit`                                                                                 | Reads the content of a specific file. Supports text, images, audio, and PDF.                         |
| `write_file`     | `Edit`   | `file_path`, `content`                                                                                         | Creates or overwrites a file with new content. Requires manual confirmation.                         |
| `glob`           | `Search` | `pattern`, `dir_path`, `case_sensitive`, `respect_git_ignore`, `respect_gemini_ignore`                         | Finds files matching specific glob patterns across the workspace.                                    |
| `grep_search`    | `Search` | `pattern`, `dir_path`, `include`, `exclude_pattern`, `names_only`, `max_matches_per_file`, `total_max_matches` | Searches for a regular expression pattern within file contents. Legacy alias: `search_file_content`. |
| `replace`        | `Edit`   | `file_path`, `old_string`, `new_string`, `expected_replacements`, `instruction`                                | Performs precise text replacement within a file. Requires manual confirmation.                       |

### Execution tools

The execution tool lets the model run shell commands on your local machine.

| Tool                | Kind      | Parameters                                            | Description                                                                                                              |
| ------------------- | --------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `run_shell_command` | `Execute` | `command`, `description`, `dir_path`, `is_background` | Executes arbitrary shell commands. Supports interactive sessions and background processes. Requires manual confirmation. |

### Web tools

Web tools let the model fetch content from URLs and perform web searches.

| Tool                | Kind     | Parameters | Description                                              |
| ------------------- | -------- | ---------- | -------------------------------------------------------- |
| `web_fetch`         | `Fetch`  | `prompt`   | Retrieves and processes content from specific URLs.      |
| `google_web_search` | `Search` | `query`    | Performs a Google Search to find up-to-date information. |

## Agent workflow tools

Agent workflow tools let the model interact with you, plan its approach, and
track its progress through multi-step tasks.

| Tool              | Kind          | Parameters  | Description                                                                                                  |
| ----------------- | ------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| `ask_user`        | `Communicate` | `questions` | Requests clarification or missing information via an interactive dialog.                                     |
| `enter_plan_mode` | `Plan`        | `reason`    | Switches the CLI to a safe, read-only "Plan Mode" for researching complex changes.                           |
| `exit_plan_mode`  | `Plan`        | `plan`      | Finalizes a plan, presents it for review, and requests approval to start implementation.                     |
| `write_todos`     | `Other`       | `todos`     | Maintains an internal list of subtasks. The model uses this to track its own progress and display it to you. |

## Internal coordination tools

Internal coordination tools let the model manage its own internal state, access
its documentation, and handle specialized sub-tasks. These tools usually run
without your direct interaction.

| Tool                | Kind    | Parameters                                                                        | Description                                                                                                        |
| ------------------- | ------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `read_many_files`   | `Read`  | `include`, `exclude`, `recursive`, `useDefaultExcludes`, `file_filtering_options` | Reads and concatenates content from multiple files. Often triggered by the `@` symbol in your prompt.              |
| `save_memory`       | `Think` | `fact`                                                                            | Persists specific facts and project details to your `GEMINI.md` file to retain context across sessions.            |
| `activate_skill`    | `Other` | `name`                                                                            | Loads specialized procedural expertise for specific tasks from the `.gemini/skills` directory.                     |
| `get_internal_docs` | `Think` | `path`                                                                            | Accesses Gemini CLI's own documentation to provide more accurate answers about its capabilities.                   |
| `complete_task`     | `Other` | `result`                                                                          | Finalizes a subagent's mission and returns the result to the parent agent. This tool is not available to the user. |

## Under the hood

For developers, the tool system is designed to be extensible and robust.

- **Tool registry**: The `ToolRegistry` class manages all available tools,
  including built-in ones, those discovered via a `discoveryCommand`, and those
  exposed by [MCP servers](../tools/mcp-server.md).
- **Tool execution flow**:
  1.  The model returns a `FunctionCall` with a tool name and arguments.
  2.  The core retrieves the tool from the registry and validates parameters.
  3.  If required, the core requests user confirmation via the CLI.
  4.  The tool's `execute()` method runs, returning a `ToolResult`.
  5.  The result's `llmContent` is sent back to the model, and `returnDisplay`
      is shown to the user.
- **Extensibility**: You can extend Gemini CLI with custom tools by configuring
  a `tools.discoveryCommand` in your settings or by connecting to MCP servers.

> **Note:** For a deep dive into the internal Tool API and how to implement your
> own tools in the codebase, see the `packages/core/src/tools/` directory.

## Next steps

- Learn how to [Set up an MCP server](../tools/mcp-server.md).
- Explore [Agent Skills](../cli/skills.md) for specialized expertise.
- See the [Command reference](../cli/commands.md) for slash commands.
