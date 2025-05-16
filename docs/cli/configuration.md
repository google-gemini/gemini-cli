# Gemini CLI Configuration

The Gemini CLI offers several ways to configure its behavior, from environment variables and command-line arguments to dedicated settings files. This document outlines the different configuration methods and available settings.

## Configuration Layers

Configuration is typically applied in the following order of precedence (lower numbers are overridden by higher numbers):

1.  **Default Values:** Hardcoded defaults within the application.
2.  **User Settings File:** Global settings for the current user.
3.  **Project Settings File:** Project-specific settings.
4.  **Environment Variables:** System-wide or session-specific variables, potentially loaded from `.env` files.
5.  **Command-line Arguments:** Values passed when launching the CLI.

## 1. Settings Files (`settings.json`)

The Gemini CLI uses `settings.json` files for persistent configuration. There are two main locations for these files:

- **User Settings:**
  - **Location:** `~/.gemini/settings.json` (where `~` is your home directory).
  - **Scope:** Applies globally to all Gemini CLI sessions for the current user.
- **Project Settings:**
  - **Location:** `.gemini/settings.json` within your project's root directory.
  - **Scope:** Applies only when running Gemini CLI from that specific project. Project settings override User settings.

### The `.gemini` Directory in Your Project

When you create a `.gemini/settings.json` file for project-specific settings, or when the system needs to store project-specific information (like custom Seatbelt profiles, e.g., `.gemini/sandbox-macos-custom.sb`), this `.gemini` directory is used.

**Purpose:**

- Stores project-specific configuration for the Gemini CLI (in `settings.json`).
- Can hold other project-specific files related to Gemini CLI's operation, such as custom sandbox profiles.

**Version Control (`.gitignore`):**

- **Generally, it's recommended to add `.gemini/` to your project's `.gitignore` file.**
  - **Reasoning:** This directory often contains user-specific preferences (like themes) or local sandbox configurations that might not be relevant or applicable to all collaborators on the project. Keeping it out of version control avoids imposing one user's local setup on others.
- **Exception:** If your team decides that certain project-specific configurations within `.gemini/` (e.g., a carefully crafted `sandbox-macos-custom.sb` profile that _all_ macOS users on the project should use) are essential for consistent project behavior, you might choose to commit specific files within `.gemini/` (e.g., `.gemini/sandbox-macos-custom.sb`) or the entire directory. However, this should be a deliberate decision by the team.
- User-specific `settings.json` often contains local paths or preferences that should not be committed.

Always consider the nature of the files within `.gemini/` before deciding to include them in version control. For most common use cases, ignoring the entire directory is the safest approach.

### Available Settings in `settings.json`:

- **`theme`** (string):
  - Specifies the visual theme for the CLI.
  - Example: `"theme": "VS2015"`
  - See the [Theming section in README.md](../../README.md#theming) for available theme names.
- **`sandbox`** (boolean or string):
  - Controls whether and how to use sandboxing for tool execution.
  - `true`: Enable default sandbox (e.g., Docker or Podman if configured, otherwise OS-level like Seatbelt on macOS).
  - `false`: Disable sandboxing (less secure).
  - `"docker"` or `"podman"`: Explicitly choose container-based sandboxing.
  - `<command>`: Specify a custom command for sandboxing.
  - Example: `"sandbox": true`
- **`toolDiscoveryCommand`** (string, advanced):
  - Custom command for tool discovery (if applicable to your setup).
- **`toolCallCommand`** (string, advanced):
  - Custom command for executing tool calls (if applicable to your setup).
- **`mcpServerCommand`** (string, advanced):
  - Custom command for the MCP (Multi-Context Prompt) server (if applicable).

### Example `settings.json`:

```json
{
  "theme": "VS2015",
  "sandbox": "docker",
  "toolDiscoveryCommand": "/usr/local/bin/my-custom-tool-discovery --json",
  "toolCallCommand": "/usr/local/bin/my-custom-tool-executor",
  "mcpServerCommand": "node /opt/mcp-server/dist/server.js --port 8080"
}
```

## 2. Environment Variables & `.env` Files

Environment variables are a common way to configure applications, especially for sensitive information like API keys or for settings that might change between environments.

The CLI automatically loads environment variables from an `.env` file. The loading order is:

1.  `.env` file in the current working directory.
2.  If not found, it searches upwards in parent directories until it finds an `.env` file or reaches the project root (identified by a `.git` folder) or the home directory.
3.  If still not found, it looks for `~/.env` (in the user's home directory).

- **`GEMINI_API_KEY`** (Required):
  - Your API key for the Gemini API.
  - **Crucial for operation.** The CLI will not function without it.
  - Set this in your shell profile (e.g., `~/.bashrc`, `~/.zshrc`) or an `.env` file.
- **`GEMINI_CODE_MODEL`**:
  - Specifies the default Gemini model to use.
  - Overrides the hardcoded default, which is currently `gemini-2.5-pro-preview-05-06`.
  - Example: `export GEMINI_CODE_MODEL="gemini-1.5-flash-latest"`
- **`GEMINI_CODE_SANDBOX`**:
  - Alternative to the `sandbox` setting in `settings.json`.
  - Accepts `true`, `false`, `docker`, `podman`, or a custom command string.
- **`SEATBELT_PROFILE`** (macOS specific):
  - Switches the Seatbelt (`sandbox-exec`) profile on macOS.
  - `minimal`: (Default) Restricts writes to the project folder but allows other operations.
  - `strict`: Uses a more restrictive profile that declines operations by default.
  - `<profile_name>`: Uses a custom profile. To define a custom profile, create a file named `sandbox-macos-<profile_name>.sb` in your project's `.gemini/` directory (e.g., `my-project/.gemini/sandbox-macos-custom.sb`).
- **`DEBUG` or `DEBUG_MODE`** (often used by underlying libraries or the CLI itself):
  - Set to `true` or `1` to enable verbose debug logging, which can be helpful for troubleshooting.

## 3. Command-Line Arguments

Arguments passed directly when running the CLI can override other configurations for that specific session.

- **`--model <model_name>`** (or **`-m <model_name>`**):
  - Specifies the Gemini model to use for this session.
  - Example: `npm start -- --model gemini-1.5-pro-latest`
- **`--sandbox`** (or **`-s`**):
  - Enables sandbox mode for this session. The exact behavior might depend on other sandbox configurations (environment variables, settings files).
- **`--debug_mode`** (or **`-d`**):
  - Enables debug mode for this session, providing more verbose output.
- **`--question <your_question>`** (or **`-q <your_question>`**):
  - Used to pass a question directly to the command, especially when piping input to the CLI.
- **`--all_files`** (or **`-a`**):
  - If set, recursively includes all files within the current directory as context for the prompt.
- **`--help`** (or **`-h`**):
  - Displays help information about command-line arguments.

## 4. `GEMINI.md` Files (Hierarchical Instructional Context)

While not strictly configuration for the CLI's _behavior_, `GEMINI.md` files are crucial for configuring the _instructional context_ provided to the Gemini model. This allows you to give project-specific instructions, coding style guides, or any relevant background information to the AI.

- **Purpose:** These Markdown files contain instructions, guidelines, or context that you want the Gemini model to be aware of during your interactions.

### Example `GEMINI.md` Content

Here's a conceptual example of what a `GEMINI.md` file at the root of a TypeScript project might contain:

```markdown
# Project: My Awesome TypeScript Library

## General Instructions:

- When generating new TypeScript code, please follow the existing coding style.
- Ensure all new functions and classes have JSDoc comments.
- Prefer functional programming paradigms where appropriate.
- All code should be compatible with TypeScript 5.0 and Node.js 18+.

## Coding Style:

- Use 2 spaces for indentation.
- Interface names should be prefixed with `I` (e.g., `IUserService`).
- Private class members should be prefixed with an underscore (`_`).
- Always use strict equality (`===` and `!==`).

## Specific Component: `src/api/client.ts`

- This file handles all outbound API requests.
- When adding new API call functions, ensure they include robust error handling and logging.
- Use the existing `fetchWithRetry` utility for all GET requests.

## Regarding Dependencies:

- Avoid introducing new external dependencies unless absolutely necessary.
- If a new dependency is required, please state the reason.
```

This example demonstrates how you can provide general project context, specific coding conventions, and even notes about particular files or components. The more relevant and precise your `GEMINI.md` files are, the better the AI can assist you.

- **Hierarchical Loading and Precedence:** The CLI loads `GEMINI.md` files from several locations, forming a hierarchy. Content from files lower in this list (more specific) typically overrides or supplements content from files higher up (more general), though the exact concatenation order should be verified with `/showmemory`:
  1.  **Global `GEMINI.md`:**
      - Location: `~/.gemini/GEMINI.md` (in your user home directory).
      - Scope: Provides default instructions for all your projects.
  2.  **Project Root & Ancestors `GEMINI.md`:**
      - Location: The CLI searches for `GEMINI.md` in the current working directory and then in each parent directory up to either the project root (identified by a `.git` folder) or your home directory.
      - Scope: Provides context relevant to the entire project or a significant portion of it.
  3.  **Sub-directory `GEMINI.md` (Contextual/Local):**
      - Location: The CLI also scans for `GEMINI.md` files in subdirectories _below_ the current working directory (respecting common ignore patterns like `node_modules`, `.git`, etc.).
      - Scope: Allows for highly specific instructions relevant to a particular component, module, or sub-section of your project.
- **Concatenation:** The contents of all found `GEMINI.md` files are concatenated (with separators indicating their origin and path) and provided as part of the system prompt to the Gemini model. You can see the exact combined content and loading order using the `/showmemory` command.
- **Commands:**
  - Use `/refreshmemory` to force a re-scan and reload of all `GEMINI.md` files.
  - Use `/showmemory` to display the combined instructional context currently loaded.

By understanding these configuration layers and the hierarchical nature of `GEMINI.md` files, you can effectively tailor the Gemini CLI and the AI's responses to your specific needs and projects.
