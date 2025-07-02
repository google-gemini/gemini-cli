# Gemini CLI Commands Reference

The Gemini CLI provides a powerful set of built-in commands to help you manage your interactive sessions, customize the interface, and control the CLI's behavior. These commands are categorized by their prefix: a forward slash (`/`) for meta-level controls, an at symbol (`@`) for file and directory context injection, and an exclamation mark (`!`) for direct shell interaction.

## Slash commands (`/`)

Slash commands provide meta-level control over the CLI itself.

- **`/bug`**
  - **Description:** File an issue about Gemini CLI. By default, the issue is filed within the GitHub repository for Gemini CLI. The string you enter after `/bug` will become the headline for the bug being filed. The default `/bug` behavior can be modified using the `bugCommand` setting in your `.gemini/settings.json` files.

- **`/chat`**
  - **Description:** Save and resume conversation history for branching conversation state interactively, or resuming a previous state from a later session.
  - **Sub-commands:**
    - **`save`**
      - **Description:** Saves the current conversation history. You must add a `<tag>` for identifying the conversation state.
      - **Usage:** `/chat save <tag>`
    - **`resume`**
      - **Description:** Resumes a conversation from a previous save.
      - **Usage:** `/chat resume <tag>`
    - **`list`**
      - **Description:** Lists available tags for chat state resumption.

- **`/clear`**
  - **Description:** Clear the terminal screen, including the visible session history and scrollback within the CLI. The underlying session data (for history recall) might be preserved depending on the exact implementation, but the visual display is cleared.
  - **Keyboard shortcut:** Press **Ctrl+L** at any time to perform a clear action.

- **`/compress`**
  - **Description:** Replace the entire chat context with a summary. This saves on tokens used for future tasks while retaining a high level summary of what has happened.

- **`/editor`**
  - **Description:** Open a dialog for selecting supported editors.

- **`/help`** (or **`/?`**)
  - **Description:** Display help information about the Gemini CLI, including available commands and their usage.

- **`/mcp`**
  - **Description:** List configured Model Context Protocol (MCP) servers, their connection status, server details, and available tools.
  - **Sub-commands:**
    - **`desc`** or **`descriptions`**:
      - **Description:** Show detailed descriptions for MCP servers and tools.
    - **`nodesc`** or **`nodescriptions`**:
      - **Description:** Hide tool descriptions, showing only the tool names.
    - **`schema`**:
      - **Description:** Show the full JSON schema for the tool's configured parameters.
  - **Keyboard Shortcut:** Press **Ctrl+T** at any time to toggle between showing and hiding tool descriptions.

- **`/memory`**
  - **Description:** Manage the AI's instructional context (hierarchical memory loaded from `GEMINI.md` files).
  - **Sub-commands:**
    - **`add`**:
      - **Description:** Adds the following text to the AI's memory. Usage: `/memory add <text to remember>`
    - **`show`**:
      - **Description:** Display the full, concatenated content of the current hierarchical memory that has been loaded from all `GEMINI.md` files. This lets you inspect the instructional context being provided to the Gemini model.
    - **`refresh`**:
      - **Description:** Reload the hierarchical instructional memory from all `GEMINI.md` files found in the configured locations (global, project/ancestors, and sub-directories). This command updates the model with the latest `GEMINI.md` content.
    - **Note:** For more details on how `GEMINI.md` files contribute to hierarchical memory, see the [CLI Configuration documentation](./configuration.md#4-geminimd-files-hierarchical-instructional-context).

- **`/restore`**
  - **Description:** Restores the project files to the state they were in just before a tool was executed. This is particularly useful for undoing file edits made by a tool. If run without a tool call ID, it will list available checkpoints to restore from.
  - **Usage:** `/restore [tool_call_id]`
  - **Note:** Only available if the CLI is invoked with the `--checkpointing` option or configured via [settings](./configuration.md). See [Checkpointing documentation](../checkpointing.md) for more details.

- **`/stats`**
  - **Description:** Display detailed statistics for the current Gemini CLI session, including token usage, cached token savings (when available), and session duration. Note: Cached token information is only displayed when cached tokens are being used, which occurs with API key authentication but not with OAuth authentication at this time.

- [**`/theme`**](./themes.md)
  - **Description:** Open a dialog that lets you change the visual theme of Gemini CLI.

- **`/auth`**
  - **Description:** Open a dialog that lets you change the authentication method.

- **`/about`**
  - **Description:** Show version info. Please share this information when filing issues.

- [**`/tools`**](../tools/index.md)
  - **Description:** Display a list of tools that are currently available within Gemini CLI.
  - **Sub-commands:**
    - **`desc`** or **`descriptions`**:
      - **Description:** Show detailed descriptions of each tool, including each tool's name with its full description as provided to the model.
    - **`nodesc`** or **`nodescriptions`**:
      - **Description:** Hide tool descriptions, showing only the tool names.

- **`/quit`** (or **`/exit`**)
  - **Description:** Exit Gemini CLI.

## At commands (`@`)

At commands are used to include the content of files or directories as part of your prompt to Gemini. These commands include git-aware filtering.

- **`@<path_to_file_or_directory>`**
  - **Description:** Inject the content of the specified file or files into your current prompt. This is useful for asking questions about specific code, text, or collections of files.
  - **Examples:**
    - `@path/to/your/file.txt Explain this text.`
    - `@src/my_project/ Summarize the code in this directory.`
    - `What is this file about? @README.md`
  - **Details:**
    - If a path to a single file is provided, the content of that file is read.
    - If a path to a directory is provided, the command attempts to read the content of files within that directory and any subdirectories.
    - Spaces in paths should be escaped with a backslash (e.g., `@My\ Documents/file.txt`).
    - The command uses the `read_many_files` tool internally. The content is fetched and then inserted into your query before being sent to the Gemini model.
    - **Git-aware filtering:** By default, git-ignored files (like `node_modules/`, `dist/`, `.env`, `.git/`) are excluded. This behavior can be changed via the `fileFiltering` settings.
    - **File types:** The command is intended for text-based files. While it might attempt to read any file, binary files or very large files might be skipped or truncated by the underlying `read_many_files` tool to ensure performance and relevance. The tool indicates if files were skipped.
  - **Output:** The CLI will show a tool call message indicating that `read_many_files` was used, along with a message detailing the status and the path(s) that were processed.

- **`@` (Lone at symbol)**
  - **Description:** If you type a lone `@` symbol without a path, the query is passed as-is to the Gemini model. This might be useful if you are specifically talking _about_ the `@` symbol in your prompt.

### Error handling for `@` commands

- If the path specified after `@` is not found or is invalid, an error message will be displayed, and the query might not be sent to the Gemini model, or it will be sent without the file content.
- If the `read_many_files` tool encounters an error (e.g., permission issues), this will also be reported.

## Shell Mode & Passthrough Commands (`!`)

The `!` prefix allows you to interact directly with your system's shell from within the Gemini CLI, enabling you to execute shell commands or toggle into an interactive shell mode.

- **`!<shell_command>`**
  - **Description:** Executes the specified `<shell_command>` in your system's default shell. All standard output and errors from the command are displayed directly in the terminal, and control returns to the Gemini CLI upon completion.
  - **Examples:**
    - `!ls -la` (Executes `ls -la` and displays its output.)
    - `!git status` (Executes `git status` to check repository status.)
    - `!npm test` (Runs your project's test suite.)

- **`!` (Toggle Shell Mode)**
  - **Description:** Typing a lone `!` symbol toggles the interactive shell mode.
    - **Entering Shell Mode:** When active, the CLI's interface changes (e.g., different coloring, a "Shell Mode Indicator") to signify that all subsequent input will be interpreted as direct shell commands. This allows for a continuous shell interaction without needing to prefix each command with `!`.
    - **Exiting Shell Mode:** Typing `!` again (or `exit` if the underlying shell supports it) reverts the UI to its standard appearance and resumes normal Gemini CLI behavior.

- **Caution for all `!` usage:** Commands executed via `!` (both single commands and within shell mode) run with the same permissions and potential impact as if you executed them directly in your native terminal. **If sandboxing is enabled, these commands will be executed within the configured sandbox environment, providing an additional layer of isolation and security.** Always exercise caution when running shell commands, especially those that modify your file system or system state.
