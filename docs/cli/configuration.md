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

**Note on Environment Variables in Settings:** String values within your `settings.json` files can reference environment variables using either `$VAR_NAME` or `${VAR_NAME}` syntax. These variables will be automatically resolved when the settings are loaded. For example, if you have an environment variable `MY_API_TOKEN`, you could use it in `settings.json` like this: `"apiKey": "$MY_API_TOKEN"`.

### The `.gemini` Directory in Your Project

When you create a `.gemini/settings.json` file for project-specific settings, or when the system needs to store project-specific information, this `.gemini` directory is used.

**Purpose:**

- Stores project-specific configuration for the Gemini CLI (in `settings.json`).
- Can hold other project-specific files related to Gemini CLI's operation, such as:
  - Custom sandbox profiles (e.g., `.gemini/sandbox-macos-custom.sb`, `.gemini/sandbox.Dockerfile`).
  - A project-specific core system prompt override file (e.g., `.gemini/system.md`). If present, this file can be used to override the default system prompt for the project.

### Available Settings in `settings.json`:

- **`contextFileName`** (string or array of strings, optional):

  - **Description:** Specifies the filename for context files (e.g., `GEMINI.md`, `AGENTS.md`). May be a single filename or a list of accepted filenames.
  - **Default:** `GEMINI.md`
  - **Example:** `"contextFileName": "AGENTS.md"`

- **`bugCommand`** (object, optional):

  - **Description:** Overrides the default URL for the `/bug` command.
  - **Properties:**
    - **`urlTemplate`** (string, required): A URL that can contain `{title}` and `{body}` placeholders.
  - **Example:**
    ```json
    "bugCommand": {
      "urlTemplate": "https://bug.example.com/new?title={title}&body={body}"
    }
    ```

- **`fileFiltering`** (object, optional):

  - **Description:** Controls git-aware file filtering behavior for @ commands and file discovery tools.
  - **Properties:**
    - **`respectGitIgnore`** (boolean, default: `true`): Whether to respect .gitignore patterns when discovering files. When enabled, git-ignored files (like `node_modules/`, `dist/`, `.env`) are automatically excluded from @ commands and file listing operations.
  - **Example:**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
    }
    ```

- **`coreTools`** (array of strings, optional):
  - **Description:** Allows you to specify a list of core tool names that should be made available to the model. This can be used to restrict or customize the set of built-in tools.
  - **Example:** `"coreTools": ["ReadFileTool", "GlobTool", "SearchText"]`.
  - **Behavior:** If this setting is provided, only the listed tools will be available for the model to use. If omitted, all default core tools are available. See [Built-in Tools](../core/tools-api.md#built-in-tools) for a list of core tools. You can also specify the alternative internal tool names used by the model, e.g. `read_file`, and you can get a full listing for that by simply asking the model "what tools do you have?".
- **`excludeTools`** (array of strings, optional):
  - **Description:** Allows you to specify a list of core tool names that should be excluded from the model.
  - **Example:** `"excludeTools": ["run_shell_command", "glob"]`.
- **`autoAccept`** (boolean, optional):

  - **Description:** Controls whether the CLI automatically accepts and executes tool calls that are considered safe (e.g., read-only operations) without explicit user confirmation.
  - **Default:** `false` (users will be prompted for most tool calls).
  - **Behavior:**
    - If set to `true`, the CLI will bypass the confirmation prompt for tools deemed safe. An indicator may be shown in the UI when auto-accept is active.
    - Potentially destructive or system-modifying tools (like `run_shell_command` or `write_file`) will likely still require confirmation regardless of this setting.
  - **Example:** `"autoAccept": true`

- **`theme`** (string):
  - Specifies the visual theme for the CLI.
  - Example: `"theme": "VS2015"`
  - See the [Theming section in README.md](../../README.md#theming) for available theme names.
- **`sandbox`** (boolean or string):
  - Controls whether and how to use sandboxing for tool execution.
  - If a `.gemini/sandbox.Dockerfile` exists in your project, it will be used to build a custom sandbox image.
  - `true`: Enable default sandbox (see [README](../../README.md) for behavior).
  - `false`: Disable sandboxing (WARNING: this is inherently unsafe).
  - `"docker"` or `"podman"`: Explicitly choose container-based sandboxing command.
  - `<command>`: Specify custom command for container-based sandboxing.
- **`toolDiscoveryCommand`** (string, advanced):
  - Custom shell command for discovering tools from your project, if available.
  - Must return on `stdout` a JSON array of [function declarations](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations).
    - Tool wrappers, i.e. `[{ "function_declarations": [...] }, ...]`, are optional.
    - Example for a single function `add_two_numbers(a, b)`:
      ```
      [
        {
          "name": "add_two_numbers",
          "description": "Add two numbers.",
          "parameters": {
            "type": "object",
            "properties": {
              "a": {
                "type": "integer",
                "description": "first number"
              },
              "b": {
                "type": "integer",
                "description": "second number"
              }
            },
            "required": [
              "a",
              "b"
            ]
          }
        }
      ]
      ```
- **`toolCallCommand`** (string, advanced):
  - Custom shell command for calling a specific tool discovered via `toolDiscoveryCommand`.
  - Must take function `name` (exactly as in [function declaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)) as first command line argument.
  - Must read function arguments as JSON on `stdin`, analogous to [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall).
    - Example for `add_two_numbers` (see above): `{"a":1, "b":2}`
  - Must return function output as JSON on `stdout`, analogous to [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse).
    - Example for `add_two_numbers` (see above): `3` (for input `{"a":1, "b":2}` on `stdin`)
- **`mcpServers`** (object, advanced):
  - Configures connections to one or more Model-Context Protocol (MCP) servers for discovering and using custom tools.
  - This is an object where each key is a unique server name (alias) and the value is an object defining that server's parameters:
    - `command` (string, required): The command to execute to start the MCP server.
    - `args` (array of strings, optional): Arguments to pass to the command.
    - `env` (object, optional): Environment variables to set for the server process.
    - `cwd` (string, optional): The working directory in which to start the server.
    - `timeout` (number, optional): Timeout in milliseconds for requests to this MCP server.
    - `trust` (boolean, optional): Trust this server and bypass all tool call confirmations.
  - **Behavior:**
    - The CLI will attempt to connect to each configured MCP server to discover available tools.
    - If multiple MCP servers expose a tool with the same name, the tool names will be prefixed with the server alias you defined in the configuration (e.g., `serverAlias__actualToolName`) to avoid conflicts.
    - The system may strip certain schema properties from MCP tool definitions for compatibility.
  - Example:
    ```json
    "mcpServers": {
      "myPythonServer": {
        "command": "python",
        "args": ["mcp_server.py", "--port", "8080"],
        "cwd": "./mcp_tools/python",
        "timeout": 5000
      },
      "myNodeServer": {
        "command": "node",
        "args": ["mcp_server.js"],
        "cwd": "./mcp_tools/node"
      },
      "myDockerServer": {
        "command": "docker",
        "args": ["run", "i", "--rm", "-e", "API_KEY", "ghcr.io/foo/bar"],
        "env": {
          "API_KEY": "$MY_API_TOKEN"
        }
      },
    }
    ```
  - **`mcpServerCommand`** (string, advanced, **deprecated**):
    - Legacy setting for configuring a single MCP server. Please use `mcpServers` instead for better flexibility and support for multiple servers.

### Example `settings.json`:

```json
{
  "theme": "VS2015",
  "sandbox": "docker",
  "toolDiscoveryCommand": "bin/get_tools",
  "toolCallCommand": "bin/call_tool",
  "mcpServers": {
    "mainServer": {
      "command": "bin/mcp_server.py"
    },
    "anotherServer": {
      "command": "node",
      "args": ["mcp_server.js", "--verbose"]
    }
  }
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
- **`GEMINI_MODEL`**:
  - Specifies the default Gemini model to use.
  - Overrides the hardcoded default, which is currently `gemini-2.5-pro-preview-05-06`.
  - Example: `export GEMINI_MODEL="gemini-1.5-flash-latest"`
- **`GOOGLE_API_KEY`**:
  - Your Google Cloud API key.
  - Required for using Vertex AI in express mode.
  - Ensure you have the necessary permissions and set the `GOOGLE_GENAI_USE_VERTEXAI=true` environment variable.
  - Example: `export GOOGLE_API_KEY="YOUR_GOOGLE_API_ KEY"`.
- **`GOOGLE_CLOUD_PROJECT`**:
  - Your Google Cloud Project ID.
  - Required for using Code Assist or Vertex AI.
  - If using Vertex AI, ensure you have the necessary permissions and set the `GOOGLE_GENAI_USE_VERTEXAI=true` environment variable.
  - Example: `export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`.
- **`OTLP_GOOGLE_CLOUD_PROJECT`**:
  - Your Google Cloud Project ID for Telemetry in Google Cloud
  - Example: `export OTLP_GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`.
- **`GOOGLE_CLOUD_LOCATION`**:
  - Your Google Cloud Project Location (e.g., us-central1).
  - Required for using Vertex AI in non express mode.
  - If using Vertex AI, ensure you have the necessary permissions and set the `GOOGLE_GENAI_USE_VERTEXAI=true` environment variable.
  - Example: `export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"`.
- **`GEMINI_CODE_ASSIST`**:
  - Enables Code Assist functionality.
  - Accepts `true`, `false`, or a custom command string.
  - If you are using an Enterprise account you should also set the `GOOGLE_CLOUD_PROJECT` environment variable.
  - Example: `export GEMINI_CODE_ASSIST=true`.
- **`GEMINI_SANDBOX`**:
  - Alternative to the `sandbox` setting in `settings.json`.
  - Accepts `true`, `false`, `docker`, `podman`, or a custom command string.
- **`SEATBELT_PROFILE`** (macOS specific):
  - Switches the Seatbelt (`sandbox-exec`) profile on macOS.
  - `permissive-open`: (Default) Restricts writes to the project folder (and a few other folders, see `packages/cli/src/utils/sandbox-macos-permissive-open.sb`) but allows other operations.
  - `strict`: Uses a strict profile that declines operations by default.
  - `<profile_name>`: Uses a custom profile. To define a custom profile, create a file named `sandbox-macos-<profile_name>.sb` in your project's `.gemini/` directory (e.g., `my-project/.gemini/sandbox-macos-custom.sb`).
- **`DEBUG` or `DEBUG_MODE`** (often used by underlying libraries or the CLI itself):
  - Set to `true` or `1` to enable verbose debug logging, which can be helpful for troubleshooting.
- **`NO_COLOR`**:
  - Set to any value to disable all color output in the CLI.
- **`CLI_TITLE`**:
  - Set to a string to customize the title of the CLI.
- **`CODE_ASSIST_ENDPOINT`**:
  - Specifies the endpoint for the code assist server.
  - This is useful for development and testing.

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

## 4. Context Files (Hierarchical Instructional Context)

While not strictly configuration for the CLI's _behavior_, context files (defaulting to `GEMINI.md` but configurable via the `contextFileName` setting) are crucial for configuring the _instructional context_ (also referred to as "memory") provided to the Gemini model. This powerful feature allows you to give project-specific instructions, coding style guides, or any relevant background information to the AI, making its responses more tailored and accurate to your needs. The CLI includes UI elements, such as an indicator in the footer showing the number of loaded context files, to keep you informed about the active context.

- **Purpose:** These Markdown files contain instructions, guidelines, or context that you want the Gemini model to be aware of during your interactions. The system is designed to manage this instructional context hierarchically.

### Example Context File Content (e.g., `GEMINI.md`)

Here's a conceptual example of what a context file at the root of a TypeScript project might contain:

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

This example demonstrates how you can provide general project context, specific coding conventions, and even notes about particular files or components. The more relevant and precise your context files are, the better the AI can assist you. Project-specific context files are highly encouraged to establish conventions and context.

- **Hierarchical Loading and Precedence:** The CLI implements a sophisticated hierarchical memory system by loading context files (e.g., `GEMINI.md`) from several locations. Content from files lower in this list (more specific) typically overrides or supplements content from files higher up (more general). The exact concatenation order and final context can be inspected using the `/memory show` command. The typical loading order is:
  1.  **Global Context File:**
      - Location: `~/.gemini/<contextFileName>` (e.g., `~/.gemini/GEMINI.md` in your user home directory).
      - Scope: Provides default instructions for all your projects.
  2.  **Project Root & Ancestors Context Files:**
      - Location: The CLI searches for the configured context file in the current working directory and then in each parent directory up to either the project root (identified by a `.git` folder) or your home directory.
      - Scope: Provides context relevant to the entire project or a significant portion of it.
  3.  **Sub-directory Context Files (Contextual/Local):**
      - Location: The CLI also scans for the configured context file in subdirectories _below_ the current working directory (respecting common ignore patterns like `node_modules`, `.git`, etc.).
      - Scope: Allows for highly specific instructions relevant to a particular component, module, or sub-section of your project.
- **Concatenation & UI Indication:** The contents of all found context files are concatenated (with separators indicating their origin and path) and provided as part of the system prompt to the Gemini model. The CLI footer displays the count of loaded context files, giving you a quick visual cue about the active instructional context.
- **Commands for Memory Management:**
  - Use `/memory refresh` to force a re-scan and reload of all context files from all configured locations. This updates the AI's instructional context.
  - Use `/memory show` to display the combined instructional context currently loaded, allowing you to verify the hierarchy and content being used by the AI.
  - See the [Commands documentation](./commands.md#memory) for full details on the `/memory` command and its sub-commands (`show` and `refresh`).

By understanding and utilizing these configuration layers and the hierarchical nature of context files, you can effectively manage the AI's memory and tailor the Gemini CLI's responses to your specific needs and projects.

## Sandboxing

The Gemini CLI can execute potentially unsafe operations (like shell commands and file modifications) within a sandboxed environment to protect your system.

Sandboxing is disabled by default, but you can enable it in a few ways:

- Using `--sandbox` or `-s` flag.
- Setting `GEMINI_SANDBOX` environment variable.
- Sandbox is enabled in `--yolo` mode by default.

By default, it uses a pre-built `gemini-cli-sandbox` Docker image.

For project-specific sandboxing needs, you can create a custom Dockerfile at `.gemini/sandbox.Dockerfile` in your project's root directory. This Dockerfile can be based on the base sandbox image:

```dockerfile
FROM gemini-cli-sandbox

# Add your custom dependencies or configurations here
# For example:
# RUN apt-get update && apt-get install -y some-package
# COPY ./my-config /app/my-config
```

When `.gemini/sandbox.Dockerfile` exists, you can use `BUILD_SANDBOX` environment variable when running Gemini CLI to automatically build the custom sandbox image:

```bash
BUILD_SANDBOX=1 gemini -s
```
