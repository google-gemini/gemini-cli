# Gemini CLI Configuration

Gemini CLI offers several ways to configure its behavior, including environment variables, command-line arguments, and settings files. This document outlines the different configuration methods and available settings.

## Configuration layers

Configuration is applied in the following order of precedence (lower numbers are overridden by higher numbers):

1.  **Default values:** Hardcoded defaults within the application.
2.  **User settings file:** Global settings for the current user.
3.  **Project settings file:** Project-specific settings.
4.  **System settings file:** System-wide settings.
5.  **Environment variables:** System-wide or session-specific variables, potentially loaded from `.env` files.
6.  **Command-line arguments:** Values passed when launching the CLI.

## Settings files

Gemini CLI uses `settings.json` files for persistent configuration. There are three locations for these files:

- **User settings file:**
  - **Location:** `~/.gemini/settings.json` (where `~` is your home directory).
  - **Scope:** Applies to all Gemini CLI sessions for the current user.
- **Project settings file:**
  - **Location:** `.gemini/settings.json` within your project's root directory.
  - **Scope:** Applies only when running Gemini CLI from that specific project. Project settings override user settings.
- **System settings file:**
  - **Location:** `/etc/gemini-cli/settings.json` (Linux), `C:\ProgramData\gemini-cli\settings.json` (Windows) or `/Library/Application Support/GeminiCli/settings.json` (macOS). The path can be overridden using the `GEMINI_CLI_SYSTEM_SETTINGS_PATH` environment variable.
  - **Scope:** Applies to all Gemini CLI sessions on the system, for all users. System settings override user and project settings. May be useful for system administrators at enterprises to have controls over users' Gemini CLI setups.

**Note on environment variables in settings:** String values within your `settings.json` files can reference environment variables using either `$VAR_NAME` or `${VAR_NAME}` syntax. These variables will be automatically resolved when the settings are loaded. For example, if you have an environment variable `MY_API_TOKEN`, you could use it in `settings.json` like this: `"apiKey": "$MY_API_TOKEN"`.

### The `.gemini` directory in your project

In addition to a project settings file, a project's `.gemini` directory can contain other project-specific files related to Gemini CLI's operation, such as:

- [Custom sandbox profiles](#sandboxing) (e.g., `.gemini/sandbox-macos-custom.sb`, `.gemini/sandbox.Dockerfile`).

### Available settings in `settings.json`:

- **`contextFileName`** (string or array of strings):
  - **Description:** Specifies the filename for context files (e.g., `GEMINI.md`, `AGENTS.md`). Can be a single filename or a list of accepted filenames.
  - **Default:** `GEMINI.md`
  - **Example:** `"contextFileName": "AGENTS.md"`

- **`bugCommand`** (object):
  - **Description:** Overrides the default URL for the `/bug` command.
  - **Default:** `"urlTemplate": "https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.yml&title={title}&info={info}"`
  - **Properties:**
    - **`urlTemplate`** (string): A URL that can contain `{title}` and `{info}` placeholders.
  - **Example:**
    ```json
    "bugCommand": {
      "urlTemplate": "https://bug.example.com/new?title={title}&info={info}"
    }
    ```

- **`fileFiltering`** (object):
  - **Description:** Controls git-aware file filtering behavior for @ commands and file discovery tools.
  - **Default:** `"respectGitIgnore": true, "enableRecursiveFileSearch": true`
  - **Properties:**
    - **`respectGitIgnore`** (boolean): Whether to respect .gitignore patterns when discovering files. When set to `true`, git-ignored files (like `node_modules/`, `dist/`, `.env`) are automatically excluded from @ commands and file listing operations.
    - **`enableRecursiveFileSearch`** (boolean): Whether to enable searching recursively for filenames under the current tree when completing @ prefixes in the prompt.
  - **Example:**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
      "enableRecursiveFileSearch": false
    }
    ```

- **`coreTools`** (array of strings):
  - **Description:** Allows you to specify a list of core tool names that should be made available to the model. This can be used to restrict the set of built-in tools. See [Built-in Tools](../core/tools-api.md#built-in-tools) for a list of core tools. You can also specify command-specific restrictions for tools that support it, like the `ShellTool`. For example, `"coreTools": ["ShellTool(ls -l)"]` will only allow the `ls -l` command to be executed.
  - **Default:** All tools available for use by the Gemini model.
  - **Example:** `"coreTools": ["ReadFileTool", "GlobTool", "ShellTool(ls)"]`.

- **`excludeTools`** (array of strings):
  - **Description:** Allows you to specify a list of core tool names that should be excluded from the model. A tool listed in both `excludeTools` and `coreTools` is excluded. You can also specify command-specific restrictions for tools that support it, like the `ShellTool`. For example, `"excludeTools": ["ShellTool(rm -rf)"]` will block the `rm -rf` command.
  - **Default**: No tools excluded.
  - **Example:** `"excludeTools": ["run_shell_command", "findFiles"]`.
  - **Security Note:** Command-specific restrictions in
    `excludeTools` for `run_shell_command` are based on simple string matching and can be easily bypassed. This feature is **not a security mechanism** and should not be relied upon to safely execute untrusted code. It is recommended to use `coreTools` to explicitly select commands
    that can be executed.

- **`allowMCPServers`** (array of strings):
  - **Description:** Allows you to specify a list of MCP server names that should be made available to the model. This can be used to restrict the set of MCP servers to connect to. Note that this will be ignored if `--allowed-mcp-server-names` is set.
  - **Default:** All MCP servers are available for use by the Gemini model.
  - **Example:** `"allowMCPServers": ["myPythonServer"]`.
  - **Security Note:** This uses simple string matching on MCP server names, which can be modified. If you're a system administrator looking to prevent users from bypassing this, consider configuring the `mcpServers` at the system settings level such that the user will not be able to configure any MCP servers of their own. This should not be used as an airtight security mechanism.

- **`excludeMCPServers`** (array of strings):
  - **Description:** Allows you to specify a list of MCP server names that should be excluded from the model. A server listed in both `excludeMCPServers` and `allowMCPServers` is excluded. Note that this will be ignored if `--allowed-mcp-server-names` is set.
  - **Default**: No MCP servers excluded.
  - **Example:** `"excludeMCPServers": ["myNodeServer"]`.
  - **Security Note:** This uses simple string matching on MCP server names, which can be modified. If you're a system administrator looking to prevent users from bypassing this, consider configuring the `mcpServers` at the system settings level such that the user will not be able to configure any MCP servers of their own. This should not be used as an airtight security mechanism.

- **`autoAccept`** (boolean):
  - **Description:** Controls whether the CLI automatically accepts and executes tool calls that are considered safe (e.g., read-only operations) without explicit user confirmation. If set to `true`, the CLI will bypass the confirmation prompt for tools deemed safe.
  - **Default:** `false`
  - **Example:** `"autoAccept": true`

- **`theme`** (string):
  - **Description:** Sets the visual [theme](./themes.md) for Gemini CLI.
  - **Default:** `"Default"`
  - **Example:** `"theme": "GitHub"`

- **`vimMode`** (boolean):
  - **Description:** Enables or disables vim mode for input editing. When enabled, the input area supports vim-style navigation and editing commands with NORMAL and INSERT modes. The vim mode status is displayed in the footer and persists between sessions.
  - **Default:** `false`
  - **Example:** `"vimMode": true`

- **`sandbox`** (boolean or string):
  - **Description:** Controls whether and how to use sandboxing for tool execution. If set to `true`, Gemini CLI uses a pre-built `gemini-cli-sandbox` Docker image. For more information, see [Sandboxing](#sandboxing).
  - **Default:** `false`
  - **Example:** `"sandbox": "docker"`

- **`toolDiscoveryCommand`** (string):
  - **Description:** Defines a custom shell command for discovering tools from your project. The shell command must return on `stdout` a JSON array of [function declarations](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations). Tool wrappers are optional.
  - **Default:** Empty
  - **Example:** `"toolDiscoveryCommand": "bin/get_tools"`

- **`toolCallCommand`** (string):
  - **Description:** Defines a custom shell command for calling a specific tool that was discovered using `toolDiscoveryCommand`. The shell command must meet the following criteria:
    - It must take function `name` (exactly as in [function declaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)) as first command line argument.
    - It must read function arguments as JSON on `stdin`, analogous to [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall).
    - It must return function output as JSON on `stdout`, analogous to [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse).
  - **Default:** Empty
  - **Example:** `"toolCallCommand": "bin/call_tool"`

- **`mcpServers`** (object):
  - **Description:** Configures connections to one or more Model-Context Protocol (MCP) servers for discovering and using custom tools. Gemini CLI attempts to connect to each configured MCP server to discover available tools. If multiple MCP servers expose a tool with the same name, the tool names will be prefixed with the server alias you defined in the configuration (e.g., `serverAlias__actualToolName`) to avoid conflicts. Note that the system might strip certain schema properties from MCP tool definitions for compatibility.
  - **Default:** Empty
  - **Properties:**
    - **`<SERVER_NAME>`** (object): The server parameters for the named server.
      - `command` (string, required): The command to execute to start the MCP server.
      - `args` (array of strings, optional): Arguments to pass to the command.
      - `env` (object, optional): Environment variables to set for the server process.
      - `cwd` (string, optional): The working directory in which to start the server.
      - `timeout` (number, optional): Timeout in milliseconds for requests to this MCP server.
      - `trust` (boolean, optional): Trust this server and bypass all tool call confirmations.
      - `includeTools` (array of strings, optional): List of tool names to include from this MCP server. When specified, only the tools listed here will be available from this server (whitelist behavior). If not specified, all tools from the server are enabled by default.
      - `excludeTools` (array of strings, optional): List of tool names to exclude from this MCP server. Tools listed here will not be available to the model, even if they are exposed by the server. **Note:** `excludeTools` takes precedence over `includeTools` - if a tool is in both lists, it will be excluded.
  - **Example:**
    ```json
    "mcpServers": {
      "myPythonServer": {
        "command": "python",
        "args": ["mcp_server.py", "--port", "8080"],
        "cwd": "./mcp_tools/python",
        "timeout": 5000,
        "includeTools": ["safe_tool", "file_reader"],
      },
      "myNodeServer": {
        "command": "node",
        "args": ["mcp_server.js"],
        "cwd": "./mcp_tools/node",
        "excludeTools": ["dangerous_tool", "file_deleter"]
      },
      "myDockerServer": {
        "command": "docker",
        "args": ["run", "-i", "--rm", "-e", "API_KEY", "ghcr.io/foo/bar"],
        "env": {
          "API_KEY": "$MY_API_TOKEN"
        }
      }
    }
    ```

- **`checkpointing`** (object):
  - **Description:** Configures the checkpointing feature, which allows you to save and restore conversation and file states. See the [Checkpointing documentation](../checkpointing.md) for more details.
  - **Default:** `{"enabled": false}`
  - **Properties:**
    - **`enabled`** (boolean): When `true`, the `/restore` command is available.

- **`preferredEditor`** (string):
  - **Description:** Specifies the preferred editor to use for viewing diffs.
  - **Default:** `vscode`
  - **Example:** `"preferredEditor": "vscode"`

- **`telemetry`** (object)
  - **Description:** Configures logging and metrics collection for Gemini CLI. For more information, see [Telemetry](../telemetry.md).
  - **Default:** `{"enabled": false, "target": "local", "otlpEndpoint": "http://localhost:4317", "logPrompts": true}`
  - **Properties:**
    - **`enabled`** (boolean): Whether or not telemetry is enabled.
    - **`target`** (string): The destination for collected telemetry. Supported values are `local` and `gcp`.
    - **`otlpEndpoint`** (string): The endpoint for the OTLP Exporter.
    - **`logPrompts`** (boolean): Whether or not to include the content of user prompts in the logs.
  - **Example:**
    ```json
    "telemetry": {
      "enabled": true,
      "target": "local",
      "otlpEndpoint": "http://localhost:16686",
      "logPrompts": false
    }
    ```
- **`usageStatisticsEnabled`** (boolean):
  - **Description:** Enables or disables the collection of usage statistics. See [Usage Statistics](#usage-statistics) for more information.
  - **Default:** `true`
  - **Example:**
    ```json
    "usageStatisticsEnabled": false
    ```

- **`hideTips`** (boolean):
  - **Description:** Enables or disables helpful tips in the CLI interface.
  - **Default:** `false`
  - **Example:**

    ```json
    "hideTips": true
    ```

- **`hideBanner`** (boolean):
  - **Description:** Enables or disables the startup banner (ASCII art logo) in the CLI interface.
  - **Default:** `false`
  - **Example:**

    ```json
    "hideBanner": true
    ```

- **`maxSessionTurns`** (number):
  - **Description:** Sets the maximum number of turns for a session. If the session exceeds this limit, the CLI will stop processing and start a new chat.
  - **Default:** `-1` (unlimited)
  - **Example:**
    ```json
    "maxSessionTurns": 10
    ```

- **`summarizeToolOutput`** (object):
  - **Description:** Enables or disables the summarization of tool output. You can specify the token budget for the summarization using the `tokenBudget` setting.
  - Note: Currently only the `run_shell_command` tool is supported.
  - **Default:** `{}` (Disabled by default)
  - **Example:**
    ```json
    "summarizeToolOutput": {
      "run_shell_command": {
        "tokenBudget": 2000
      }
    }
    ```

- **`excludedProjectEnvVars`** (array of strings):
  - **Description:** Specifies environment variables that should be excluded from being loaded from project `.env` files. This prevents project-specific environment variables (like `DEBUG=true`) from interfering with gemini-cli behavior. Variables from `.gemini/.env` files are never excluded.
  - **Default:** `["DEBUG", "DEBUG_MODE"]`
  - **Example:**
    ```json
    "excludedProjectEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
    ```

- **`includeDirectories`** (array of strings):
  - **Description:** Specifies an array of additional absolute or relative paths to include in the workspace context. This allows you to work with files across multiple directories as if they were one. Paths can use `~` to refer to the user's home directory. This setting can be combined with the `--include-directories` command-line flag.
  - **Default:** `[]`
  - **Example:**
    ```json
    "includeDirectories": [
      "/path/to/another/project",
      "../shared-library",
      "~/common-utils"
    ]
    ```

- **`loadMemoryFromIncludeDirectories`** (boolean):
  - **Description:** Controls the behavior of the `/memory refresh` command. If set to `true`, `GEMINI.md` files should be loaded from all directories that are added. If set to `false`, `GEMINI.md` should only be loaded from the current directory.
  - **Default:** `false`
  - **Example:**
    ```json
    "loadMemoryFromIncludeDirectories": true
    ```

- **`chatCompression`** (object):
  - **Description:** Controls the settings for chat history compression, both automatic and
    when manually invoked through the /compress command.
  - **Properties:**
    - **`contextPercentageThreshold`** (number): A value between 0 and 1 that specifies the token threshold for compression as a percentage of the model's total token limit. For example, a value of `0.6` will trigger compression when the chat history exceeds 60% of the token limit.
  - **Example:**
    ```json
    "chatCompression": {
      "contextPercentageThreshold": 0.6
    }
    ```

- **`showLineNumbers`** (boolean):
  - **Description:** Controls whether line numbers are displayed in code blocks in the CLI output.
  - **Default:** `true`
  - **Example:**
    ```json
    "showLineNumbers": false
    ```

- **`thinkingConfig`** (object):
  - **Description:** Configures the thinking behavior of the Gemini model during conversations. This controls whether the model's internal thought process is included in responses and the token budget allocated for thinking.
  - **Default:** `{"includeThoughts": true}` (when thinking is enabled)
  - **Properties:**
    - **`includeThoughts`** (boolean, optional): Whether to include the model's thinking process in responses. If true, thoughts are returned only if the model supports thinking and thoughts are available.
    - **`thinkingBudget`** (number, optional): The thinking budget in tokens. Use `0` to disable thinking, `-1` for automatic budget allocation, or specify a positive number for a custom token limit. Default values and allowed ranges are model-dependent.
  - **Example:**
    ```json
    "thinkingConfig": {
      "includeThoughts": false,
      "thinkingBudget": 1000
    }
    ```

### Example `settings.json`:

```json
{
  "theme": "GitHub",
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
  },
  "telemetry": {
    "enabled": true,
    "target": "local",
    "otlpEndpoint": "http://localhost:4317",
    "logPrompts": true
  },
  "usageStatisticsEnabled": true,
  "hideTips": false,
  "hideBanner": false,
  "maxSessionTurns": 10,
  "summarizeToolOutput": {
    "run_shell_command": {
      "tokenBudget": 100
    }
  },
  "excludedProjectEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"],
  "includeDirectories": ["path/to/dir1", "~/path/to/dir2", "../path/to/dir3"],
  "loadMemoryFromIncludeDirectories": true,
  "thinkingConfig": {
    "includeThoughts": false,
    "thinkingBudget": 1000
  }
}
```

## Shell History

The CLI keeps a history of shell commands you run. To avoid conflicts between different projects, this history is stored in a project-specific directory within your user's home folder.

- **Location:** `~/.gemini/tmp/<project_hash>/shell_history`
  - `<project_hash>` is a unique identifier generated from your project's root path.
  - The history is stored in a file named `shell_history`.

## Environment Variables & `.env` Files

Environment variables are a common way to configure applications, especially for sensitive information like API keys or for settings that might change between environments.

The CLI automatically loads environment variables from an `.env` file. The loading order is:

1.  `.env` file in the current working directory.
2.  If not found, it searches upwards in parent directories until it finds an `.env` file or reaches the project root (identified by a `.git` folder) or the home directory.
3.  If still not found, it looks for `~/.env` (in the user's home directory).

**Environment Variable Exclusion:** Some environment variables (like `DEBUG` and `DEBUG_MODE`) are automatically excluded from being loaded from project `.env` files to prevent interference with gemini-cli behavior. Variables from `.gemini/.env` files are never excluded. You can customize this behavior using the `excludedProjectEnvVars` setting in your `settings.json` file.

- **`GEMINI_API_KEY`** (Required):
  - Your API key for the Gemini API.
  - **Crucial for operation.** The CLI will not function without it.
  - Set this in your shell profile (e.g., `~/.bashrc`, `~/.zshrc`) or an `.env` file.
- **`GEMINI_MODEL`**:
  - Specifies the default Gemini model to use.
  - Overrides the hardcoded default
  - Example: `export GEMINI_MODEL="gemini-2.5-flash"`
- **`GOOGLE_API_KEY`**:
  - Your Google Cloud API key.
  - Required for using Vertex AI in express mode.
  - Ensure you have the necessary permissions.
  - Example: `export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"`.
- **`GOOGLE_CLOUD_PROJECT`**:
  - Your Google Cloud Project ID.
  - Required for using Code Assist or Vertex AI.
  - If using Vertex AI, ensure you have the necessary permissions in this project.
  - **Cloud Shell Note:** When running in a Cloud Shell environment, this variable defaults to a special project allocated for Cloud Shell users. If you have `GOOGLE_CLOUD_PROJECT` set in your global environment in Cloud Shell, it will be overridden by this default. To use a different project in Cloud Shell, you must define `GOOGLE_CLOUD_PROJECT` in a `.env` file.
  - Example: `export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`.
- **`GOOGLE_APPLICATION_CREDENTIALS`** (string):
  - **Description:** The path to your Google Application Credentials JSON file.
  - **Example:** `export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/credentials.json"`
- **`OTLP_GOOGLE_CLOUD_PROJECT`**:
  - Your Google Cloud Project ID for Telemetry in Google Cloud
  - Example: `export OTLP_GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`.
- **`GOOGLE_CLOUD_LOCATION`**:
  - Your Google Cloud Project Location (e.g., us-central1).
  - Required for using Vertex AI in non express mode.
  - Example: `export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"`.
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
  - **Note:** These variables are automatically excluded from project `.env` files by default to prevent interference with gemini-cli behavior. Use `.gemini/.env` files if you need to set these for gemini-cli specifically.
- **`NO_COLOR`**:
  - Set to any value to disable all color output in the CLI.
- **`CLI_TITLE`**:
  - Set to a string to customize the title of the CLI.
- **`CODE_ASSIST_ENDPOINT`**:
  - Specifies the endpoint for the code assist server.
  - This is useful for development and testing.

## Command-Line Arguments

Arguments passed directly when running the CLI can override other configurations for that specific session.

- **`--model <model_name>`** (**`-m <model_name>`**):
  - Specifies the Gemini model to use for this session.
  - Example: `npm start -- --model gemini-1.5-pro-latest`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**):
  - Used to pass a prompt directly to the command. This invokes Gemini CLI in a non-interactive mode.
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**):
  - Starts an interactive session with the provided prompt as the initial input.
  - The prompt is processed within the interactive session, not before it.
  - Cannot be used when piping input from stdin.
  - Example: `gemini -i "explain this code"`
- **`--sandbox`** (**`-s`**):
  - Enables sandbox mode for this session.
- **`--sandbox-image`**:
  - Sets the sandbox image URI.
- **`--debug`** (**`-d`**):
  - Enables debug mode for this session, providing more verbose output.
- **`--all-files`** (**`-a`**):
  - If set, recursively includes all files within the current directory as context for the prompt.
- **`--help`** (or **`-h`**):
  - Displays help information about command-line arguments.
- **`--show-memory-usage`**:
  - Displays the current memory usage.
- **`--yolo`**:
  - Enables YOLO mode, which automatically approves all tool calls.
- **`--approval-mode <mode>`**:
  - Sets the approval mode for tool calls. Available modes:
    - `default`: Prompt for approval on each tool call (default behavior)
    - `auto_edit`: Automatically approve edit tools (replace, write_file) while prompting for others
    - `yolo`: Automatically approve all tool calls (equivalent to `--yolo`)
  - Cannot be used together with `--yolo`. Use `--approval-mode=yolo` instead of `--yolo` for the new unified approach.
  - Example: `gemini --approval-mode auto_edit`
- **`--telemetry`**:
  - Enables [telemetry](../telemetry.md).
- **`--telemetry-target`**:
  - Sets the telemetry target. See [telemetry](../telemetry.md) for more information.
- **`--telemetry-otlp-endpoint`**:
  - Sets the OTLP endpoint for telemetry. See [telemetry](../telemetry.md) for more information.
- **`--telemetry-log-prompts`**:
  - Enables logging of prompts for telemetry. See [telemetry](../telemetry.md) for more information.
- **`--checkpointing`**:
  - Enables [checkpointing](../checkpointing.md).
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**):
  - Specifies a list of extensions to use for the session. If not provided, all available extensions are used.
  - Use the special term `gemini -e none` to disable all extensions.
  - Example: `gemini -e my-extension -e my-other-extension`
- **`--list-extensions`** (**`-l`**):
  - Lists all available extensions and exits.
- **`--proxy`**:
  - Sets the proxy for the CLI.
  - Example: `--proxy http://localhost:7890`.
- **`--include-directories <dir1,dir2,...>`**:
  - Includes additional directories in the workspace for multi-directory support.
  - Can be specified multiple times or as comma-separated values.
  - 5 directories can be added at maximum.
  - Example: `--include-directories /path/to/project1,/path/to/project2` or `--include-directories /path/to/project1 --include-directories /path/to/project2`
- **`--version`**:
  - Displays the version of the CLI.

## Context Files (Hierarchical Instructional Context)

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
- All code should be compatible with TypeScript 5.0 and Node.js 20+.

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
      - Location: The CLI also scans for the configured context file in subdirectories _below_ the current working directory (respecting common ignore patterns like `node_modules`, `.git`, etc.). The breadth of this search is limited to 200 directories by default, but can be configured with a `memoryDiscoveryMaxDirs` field in your `settings.json` file.
      - Scope: Allows for highly specific instructions relevant to a particular component, module, or subsection of your project.
- **Concatenation & UI Indication:** The contents of all found context files are concatenated (with separators indicating their origin and path) and provided as part of the system prompt to the Gemini model. The CLI footer displays the count of loaded context files, giving you a quick visual cue about the active instructional context.
- **Importing Content:** You can modularize your context files by importing other Markdown files using the `@path/to/file.md` syntax. For more details, see the [Memory Import Processor documentation](../core/memport.md).
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
- Sandbox is enabled when using `--yolo` or `--approval-mode=yolo` by default.

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

## Usage Statistics

To help us improve the Gemini CLI, we collect anonymized usage statistics. This data helps us understand how the CLI is used, identify common issues, and prioritize new features.

**What we collect:**

- **Tool Calls:** We log the names of the tools that are called, whether they succeed or fail, and how long they take to execute. We do not collect the arguments passed to the tools or any data returned by them.
- **API Requests:** We log the Gemini model used for each request, the duration of the request, and whether it was successful. We do not collect the content of the prompts or responses.
- **Session Information:** We collect information about the configuration of the CLI, such as the enabled tools and the approval mode.

**What we DON'T collect:**

- **Personally Identifiable Information (PII):** We do not collect any personal information, such as your name, email address, or API keys.
- **Prompt and Response Content:** We do not log the content of your prompts or the responses from the Gemini model.
- **File Content:** We do not log the content of any files that are read or written by the CLI.

**How to opt out:**

You can opt out of usage statistics collection at any time by setting the `usageStatisticsEnabled` property to `false` in your `settings.json` file:

```json
{
  "usageStatisticsEnabled": false
}
```
