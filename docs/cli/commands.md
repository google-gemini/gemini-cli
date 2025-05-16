# CLI Commands

The Gemini CLI supports several built-in commands to help you manage your session, customize the interface, and control its behavior. These commands are typically prefixed with a forward slash (`/`), an at symbol (`@`), or an exclamation mark (`!`).

## Slash Commands (`/`)

Slash commands provide meta-level control over the CLI itself. They can typically be executed by typing the command and pressing `Enter`.

- **`/help`** (or **`/?`**)

  - **Description:** Displays help information about the Gemini CLI, including available commands and their usage.
  - **Action:** Opens a help dialog or section within the CLI.

- **`/clear`** (Shortcut: **Ctrl+L**)

  - **Description:** Clears the entire terminal screen, including the visible session history and scrollback within the CLI.
  - **Action:** Wipes the terminal display. The underlying session data (for history recall) might be preserved depending on the exact implementation, but the visual display is cleared.

- **`/theme`**

  - **Description:** Allows you to change the visual theme of the Gemini CLI.
  - **Action:** Opens a dialog or prompt to select from available themes.

- **`/refreshmemory`**

  - **Description:** Reloads instructional context from all `GEMINI.md` files found in the current directory hierarchy (project, user, and global).
  - **Action:** The CLI re-scans for `GEMINI.md` files and updates its instructional memory with their content.

- **`/showmemory`**

  - **Description:** Displays the current hierarchical memory content that has been loaded from `GEMINI.md` files.
  - **Action:** Outputs the combined content of all loaded `GEMINI.md` files, showing the context being provided to the Gemini model.

- **`/quit`** (or **`/exit`**)
  - **Description:** Exits the Gemini CLI application.
  - **Action:** Terminates the CLI process.

## At Commands (`@`)

At commands are used to quickly include the content of files or directories as part of your prompt to Gemini.

- **`@<path_to_file_or_directory>`**

  - **Description:** Injects the content of the specified file or files within a directory into your current prompt. This is useful for asking questions about specific code, text, or collections of files.
  - **Usage:**
    - `@path/to/your/file.txt Explain this text.`
    - `@src/my_project/ Summarize the code in this directory.`
    - `What is this file about? @README.md`
  - **Details:**
    - If a path to a single file is provided, the content of that file is read.
    - If a path to a directory is provided, the command attempts to read the content of files within that directory (often recursively, like `directory/**`).
    - Spaces in paths should be escaped with a backslash (e.g., `@My\ Documents/file.txt`).
    - The command uses the `read_many_files` tool internally. The content is fetched and then prepended or inserted into your query before being sent to the Gemini model.
    - The text before and after the `@<path>` part of your query is preserved and sent along with the file content.
    - **File Types:** The command is intended for text-based files. While it might attempt to read any file, binary files or very large files might be skipped or truncated by the underlying `read_many_files` tool to ensure performance and relevance. The tool will typically indicate if files were skipped.
  - **Output:** The CLI will show a tool call message indicating that `read_many_files` was used, along with an improved display message detailing the status (e.g., number of files read, total size) and the path(s) that were processed.

- **`@` (Lone At Symbol)**
  - **Description:** If you type a lone `@` symbol without a path, the entire query (including the `@`) is passed directly to the Gemini model. This might be useful if you are specifically talking _about_ the `@` symbol itself in your prompt.

### Error Handling for `@` Commands

- If the path specified after `@` is not found or is invalid, an error message will be displayed, and the query might not be sent to the Gemini model, or it will be sent without the file content.
- If the `read_many_files` tool encounters an error (e.g., permission issues), this will also be reported.

## Shell Passthrough Commands (`!`)

Shell passthrough commands allow you to execute arbitrary shell commands directly from the Gemini CLI. This can be useful for quickly performing system tasks, listing files, or running scripts without leaving the CLI environment.

- **`!<shell_command>`**

  - **Description:** Executes the given command in your system's default shell.
  - **Usage:**
    - `!ls -la`
    - `!git status`
    - `!echo "Hello from the shell"`
  - **Action:** The command following the `!` is passed to the system shell for execution. The standard output and standard error from the command are then displayed directly within the Gemini CLI.
  - **Caution:** Be mindful of the commands you execute, as they have the same permissions and impact as if you ran them directly in your terminal.

These commands provide a powerful way to interact with the Gemini CLI and integrate local file content seamlessly into your conversations with the AI.
