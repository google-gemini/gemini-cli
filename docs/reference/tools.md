# Tools reference

Gemini CLI uses tools to interact with your local environment, access
information, and perform actions on your behalf. These tools extend the model's
capabilities beyond text generation, letting it read files, execute commands,
and search the web.

## Internal tools

Internal tools are the bridge between the Gemini model and your local
environment. When you interact with Gemini CLI, the model can request to use one
or more of these tools to fulfill your request. Gemini CLI may also request
permission to use one or more of these tools.

- **Operational tools** are used to perform actions that directly affect your
  local environment, such as reading and writing files, executing commands, and
  searching the web. These tools often require your confirmation before they are
  executed.
- **Internal coordination tools** are used by the model to manage its own
  internal state, such as tracking its progress on a task or accessing its own
  documentation. These tools are often executed without your direct interaction.

## The `/tools` command

Explore the tools currently available to the Gemini model using the `/tools`
command.

- **`/tools`**: Lists all registered tools with their display names.
- **`/tools desc`**: Lists all tools with their full descriptions as provided to
  the Gemini model.

This command is useful for verifying which tools are active, especially when
using custom tools via [MCP servers](../tools/mcp-server.md) or
[extensions](../extensions/index.md).

## Operational tools

This section provides a summary of the built-in operational tools available in
Gemini CLI. These tools are used to perform actions that directly affect your
local environment, such as reading and writing files, executing commands, and
searching the web.

### File system tools

These tools allow the model to explore and modify your local codebase.

- **`list_directory`**: Lists the names of files and subdirectories within a
  specified path.
- **`read_file`**: Reads the content of a specific file. Supports text, images,
  audio, and PDF.
- **`write_file`**: Creates or overwrites a file with new content. Requires
  manual confirmation.
- **`glob`**: Finds files matching specific glob patterns across the workspace.
- **`grep_search`**: Searches for a regular expression pattern within file
  contents.
- **`replace`**: Performs precise text replacement within a file. Requires
  manual confirmation.

### Execution tools

- **`run_shell_command`**: Executes arbitrary shell commands. Supports
  interactive sessions and background processes. Requires manual confirmation.

### Web tools

- **`web_fetch`**: Retrieves and processes content from specific URLs.
- **`google_web_search`**: Performs a Google Search to find up-to-date
  information.

### User-facing tools

- **`ask_user`**: Requests clarification or missing information via an
  interactive dialog.
- **`enter_plan_mode`**: Switches the CLI to a safe, read-only "Plan Mode" for
  researching complex changes.
- **`exit_plan_mode`**: Finalizes a plan, presents it for review, and requests
  approval to start implementation.

## Internal coordination tools

This section provides a summary of the built-in internal coordination tools
available in Gemini CLI. These tools are used by the model to manage its own
internal state, such as tracking its progress on a task or accessing its own
documentation.

- **`read_many_files`**: Reads and concatenates content from multiple files or
  glob patterns. This tool is often triggered by the `@` symbol in the prompt,
  but the model can also call it directly for broad context gathering.
- **`save_memory`**: Persists specific facts and project details to your
  `GEMINI.md` file. While you can see the result, the model calls this tool
  autonomously to retain context.
- **`write_todos`**: Maintains an internal list of subtasks for multi-step
  requests. The model uses this to track its own progress, which is then
  displayed to you.
- **`activate_skill`**: Loads specialized procedural expertise for specific
  tasks from the `.gemini/skills` directory.
- **`get_internal_docs`**: Accesses Gemini CLI's own documentation to provide
  more accurate answers about its capabilities.
- **`complete_task`**: Finalizes a subagent's mission and returns the result to
  the parent agent. This tool is not available to the user.

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
- See the [Command reference](../cli/commands.md) for more slash commands.
