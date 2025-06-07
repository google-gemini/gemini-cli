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

- [**`/theme`**](./themes.md)

  - **Description:** Allows you to change the visual theme of the Gemini CLI.
  - **Action:** Opens a dialog or prompt to select from available themes.

- **`/memory`**

  - **Description:** Manages the AI's instructional context (hierarchical memory loaded from `GEMINI.md` files) and allows for adding ad-hoc memory entries.
  - **Usage:** `/memory <sub_command> [text_for_add]`
  - **Sub-commands:**
    - **`show`**:
      - **Description:** Displays the full, concatenated content of the current hierarchical memory that has been loaded from all `GEMINI.md` files. This allows you to inspect the exact instructional context being provided to the Gemini model.
      - **Action:** Outputs the combined content of all loaded `GEMINI.md` files, including separators that indicate the origin and path of each part of the memory. This is useful for verifying the loading order and final context.
    - **`refresh`**:
      - **Description:** Reloads the hierarchical instructional context (memory) from all `GEMINI.md` files found in the configured locations (global, project/ancestors, and sub-directories). This command updates the AI's understanding based on the latest `GEMINI.md` content.
      - **Action:** The CLI re-scans for all relevant `GEMINI.md` files and rebuilds its instructional memory. The number of loaded files is typically indicated in the CLI footer.
    - **Note:** For more details on how `GEMINI.md` files contribute to hierarchical memory, see the [CLI Configuration documentation](./configuration.md#4-geminimd-files-hierarchical-instructional-context).

- **`/quit`** (or **`/exit`**)

  - **Description:** Exits the Gemini CLI application.
  - **Action:** Terminates the CLI process.

- **`/tools`**
  - **Description:** Displays a list of all the tools that are currently available to the model.
  - **Action:** Outputs a list of the available tools.

## At Commands (`@`)

At commands are used to quickly include the content of files or directories as part of your prompt to Gemini. These commands now feature git-aware filtering.

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
    - **Git-Aware Filtering:** By default, git-ignored files (like `node_modules/`, `dist/`, `.env`, `.git/`) are automatically excluded. This behavior can be configured via the `fileFiltering` settings.
    - **File Types:** The command is intended for text-based files. While it might attempt to read any file, binary files or very large files might be skipped or truncated by the underlying `read_many_files` tool to ensure performance and relevance. The tool will typically indicate if files were skipped.
  - **Output:** The CLI will show a tool call message indicating that `read_many_files` was used, along with an improved display message detailing the status (e.g., number of files read, total size) and the path(s) that were processed.

- **`@` (Lone At Symbol)**
  - **Description:** If you type a lone `@` symbol without a path, the entire query (including the `@`) is passed directly to the Gemini model. This might be useful if you are specifically talking _about_ the `@` symbol itself in your prompt.

### Error Handling for `@` Commands

- If the path specified after `@` is not found or is invalid, an error message will be displayed, and the query might not be sent to the Gemini model, or it will be sent without the file content.
- If the `read_many_files` tool encounters an error (e.g., permission issues), this will also be reported.

## Shell Mode & Passthrough Commands (`!`)

The `!` prefix provides a powerful way to interact with your system's shell directly from within the Gemini CLI. It allows for both single command execution and a toggleable Shell Mode for a more persistent shell experience.

- **`!<shell_command>`**

  - **Description:** Executes the given `<shell_command>` in your system's default shell.
  - **Usage:**
    - `!ls -la` (executes `ls -la` and returns to normal CLI mode)
    - `!git status` (executes `git status` and returns to normal CLI mode)
  - **Action:** The command following the `!` is passed to the system shell for execution. Standard output and standard error are displayed in the CLI. After execution, the CLI typically returns to its standard conversational mode.

- **`!` (Toggle Shell Mode)**

  - **Description:** Typing `!` on its own (without an immediately following command) toggles Shell Mode.
  - **Action & Behavior:**
    - **Entering Shell Mode:**
      - The UI will update, often with different coloring and a "Shell Mode Indicator," to clearly show that Shell Mode is active.
      - Most slash commands (e.g., `/help`, `/theme`) and AI-powered suggestions are disabled to provide an uninterrupted shell experience.
      - Any text you type is interpreted directly as a shell command.
    - **Exiting Shell Mode:**
      - Typing `!` again while in Shell Mode will toggle it off.
      - The UI will revert to its standard appearance.
      - Slash commands and AI suggestions are re-enabled.
  - **Usage:**
    - Type `!` and press Enter to enter Shell Mode.
    - Type your shell commands (e.g., `cd my_project`, `npm run dev`, `cat file.txt`).
    - Type `!` and press Enter again to exit Shell Mode.

- **Caution for all `!` usage:** Be mindful of the commands you execute, as they have the same permissions and impact as if you ran them directly in your terminal. The Shell Mode feature does not inherently add extra sandboxing beyond what's already configured for the underlying `execute_bash_command` tool.

This integrated shell capability allows for seamless switching between AI-assisted tasks and direct system interaction.
