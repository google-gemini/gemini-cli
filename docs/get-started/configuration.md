# Gemini CLI Configuration

> **Note on Configuration Format, 9/17/25:** The format of the `settings.json` file has been updated to a new, more organized structure.
>
> - The new format will be supported in the stable release starting **[09/10/25]**.
> - Automatic migration from the old format to the new format will begin on **[09/17/25]**.
>
> For details on the previous format, please see the [v1 Configuration documentation](./configuration-v1.md).

Gemini CLI offers several ways to configure its behavior, including environment variables, command-line arguments, and settings files. This document outlines the different configuration methods and available settings.

## Configuration layers

Configuration is applied in the following order of precedence (lower numbers are overridden by higher numbers):

1.  **Default values:** Hardcoded defaults within the application.
2.  **System defaults file:** System-wide default settings that can be overridden by other settings files.
3.  **User settings file:** Global settings for the current user.
4.  **Project settings file:** Project-specific settings.
5.  **System settings file:** System-wide settings that override all other settings files.
6.  **Environment variables:** System-wide or session-specific variables, potentially loaded from `.env` files.
7.  **Command-line arguments:** Values passed when launching the CLI.

## Settings files

Gemini CLI uses JSON settings files for persistent configuration. There are four locations for these files:

- **System defaults file:**
  - **Location:** `/etc/gemini-cli/system-defaults.json` (Linux), `C:\ProgramData\gemini-cli\system-defaults.json` (Windows) or `/Library/Application Support/GeminiCli/system-defaults.json` (macOS). The path can be overridden using the `GEMINI_CLI_SYSTEM_DEFAULTS_PATH` environment variable.
  - **Scope:** Provides a base layer of system-wide default settings. These settings have the lowest precedence and are intended to be overridden by user, project, or system override settings.
- **User settings file:**
  - **Location:** `~/.gemini/settings.json` (where `~` is your home directory).
  - **Scope:** Applies to all Gemini CLI sessions for the current user. User settings override system defaults.
- **Project settings file:**
  - **Location:** `.gemini/settings.json` within your project's root directory.
  - **Scope:** Applies only when running Gemini CLI from that specific project. Project settings override user settings and system defaults.
- **System settings file:**
  - **Location:** `/etc/gemini-cli/settings.json` (Linux), `C:\ProgramData\gemini-cli\settings.json` (Windows) or `/Library/Application Support/GeminiCli/settings.json` (macOS). The path can be overridden using the `GEMINI_CLI_SYSTEM_SETTINGS_PATH` environment variable.
  - **Scope:** Applies to all Gemini CLI sessions on the system, for all users. System settings act as overrides, taking precedence over all other settings files. May be useful for system administrators at enterprises to have controls over users' Gemini CLI setups.

**Note on environment variables in settings:** String values within your `settings.json` files can reference environment variables using either `$VAR_NAME` or `${VAR_NAME}` syntax. These variables will be automatically resolved when the settings are loaded. For example, if you have an environment variable `MY_API_TOKEN`, you could use it in `settings.json` like this: `"apiKey": "$MY_API_TOKEN"`.

> **Note for Enterprise Users:** For guidance on deploying and managing Gemini CLI in a corporate environment, please see the [Enterprise Configuration](../cli/enterprise.md) documentation.

### The `.gemini` directory in your project

In addition to a project settings file, a project's `.gemini` directory can contain other project-specific files related to Gemini CLI's operation, such as:

- [Custom sandbox profiles](#sandboxing) (e.g., `.gemini/sandbox-macos-custom.sb`, `.gemini/sandbox.Dockerfile`).

### Available settings in `settings.json`

Settings are organized into categories. All settings should be placed within their corresponding top-level category object in your `settings.json` file.

#### `general`

- **`general.preferredEditor`** (string):
  - **Description:** The preferred editor to open files in.
  - **Default:** `undefined`

- **`general.vimMode`** (boolean):
  - **Description:** Enable Vim keybindings.
  - **Default:** `false`

- **`general.disableAutoUpdate`** (boolean):
  - **Description:** Disable automatic updates.
  - **Default:** `false`

- **`general.disableUpdateNag`** (boolean):
  - **Description:** Disable update notification prompts.
  - **Default:** `false`

- **`general.checkpointing.enabled`** (boolean):
  - **Description:** Enable session checkpointing for recovery.
  - **Default:** `false`

#### `output`

- **`output.format`** (string):
  - **Description:** The format of the CLI output.
  - **Default:** `"text"`
  - **Values:** `"text"`, `"json"`

#### `ui`

- **`ui.theme`** (string):
  - **Description:** The color theme for the UI. See [Themes](../cli/themes.md) for available options.
  - **Default:** `undefined`

- **`ui.customThemes`** (object):
  - **Description:** Custom theme definitions.
  - **Default:** `{}`

- **`ui.hideWindowTitle`** (boolean):
  - **Description:** Hide the window title bar.
  - **Default:** `false`

- **`ui.hideTips`** (boolean):
  - **Description:** Hide helpful tips in the UI.
  - **Default:** `false`

- **`ui.hideBanner`** (boolean):
  - **Description:** Hide the application banner.
  - **Default:** `false`

- **`ui.hideFooter`** (boolean):
  - **Description:** Hide the footer from the UI.
  - **Default:** `false`

- **`ui.showMemoryUsage`** (boolean):
  - **Description:** Display memory usage information in the UI.
  - **Default:** `false`

- **`ui.showLineNumbers`** (boolean):
  - **Description:** Show line numbers in the chat.
  - **Default:** `false`

- **`ui.showCitations`** (boolean):
  - **Description:** Show citations for generated text in the chat.
  - **Default:** `true`

- **`ui.accessibility.disableLoadingPhrases`** (boolean):
  - **Description:** Disable loading phrases for accessibility.
  - **Default:** `false`

- **`ui.customWittyPhrases`** (array of strings):
  - **Description:** A list of custom phrases to display during loading states. When provided, the CLI will cycle through these phrases instead of the default ones.
  - **Default:** `[]`

#### `ide`

- **`ide.enabled`** (boolean):
  - **Description:** Enable IDE integration mode.
  - **Default:** `false`

- **`ide.hasSeenNudge`** (boolean):
  - **Description:** Whether the user has seen the IDE integration nudge.
  - **Default:** `false`

#### `privacy`

- **`privacy.usageStatisticsEnabled`** (boolean):
  - **Description:** Enable collection of usage statistics.
  - **Default:** `true`

#### `model`

- **`model.name`** (string):
  - **Description:** The Gemini model to use for conversations.
  - **Default:** `undefined`

- **`model.maxSessionTurns`** (number):
  - **Description:** Maximum number of user/model/tool turns to keep in a session. -1 means unlimited.
  - **Default:** `-1`

- **`model.summarizeToolOutput`** (object):
  - **Description:** Enables or disables the summarization of tool output. You can specify the token budget for the summarization using the `tokenBudget` setting. Note: Currently only the `run_shell_command` tool is supported. For example `{"run_shell_command": {"tokenBudget": 2000}}`
  - **Default:** `undefined`

- **`model.chatCompression.contextPercentageThreshold`** (number):
  - **Description:** Sets the threshold for chat history compression as a percentage of the model's total token limit. This is a value between 0 and 1 that applies to both automatic compression and the manual `/compress` command. For example, a value of `0.6` will trigger compression when the chat history exceeds 60% of the token limit.
  - **Default:** `0.7`

- **`model.skipNextSpeakerCheck`** (boolean):
  - **Description:** Skip the next speaker check.
  - **Default:** `false`

#### `context`

- **`context.fileName`** (string or array of strings):
  - **Description:** The name of the context file(s).
  - **Default:** `undefined`

- **`context.importFormat`** (string):
  - **Description:** The format to use when importing memory.
  - **Default:** `undefined`

- **`context.discoveryMaxDirs`** (number):
  - **Description:** Maximum number of directories to search for memory.
  - **Default:** `200`

- **`context.includeDirectories`** (array):
  - **Description:** Additional directories to include in the workspace context. Missing directories will be skipped with a warning.
  - **Default:** `[]`

- **`context.loadFromIncludeDirectories`** (boolean):
  - **Description:** Controls the behavior of the `/memory refresh` command. If set to `true`, `GEMINI.md` files should be loaded from all directories that are added. If set to `false`, `GEMINI.md` should only be loaded from the current directory.
  - **Default:** `false`

- **`context.fileFiltering.respectGitIgnore`** (boolean):
  - **Description:** Respect .gitignore files when searching.
  - **Default:** `true`

- **`context.fileFiltering.respectGeminiIgnore`** (boolean):
  - **Description:** Respect .geminiignore files when searching.
  - **Default:** `true`

- **`context.fileFiltering.enableRecursiveFileSearch`** (boolean):
  - **Description:** Whether to enable searching recursively for filenames under the current tree when completing `@` prefixes in the prompt.
  - **Default:** `true`

#### `tools`

- **`tools.sandbox`** (boolean or string):
  - **Description:** Sandbox execution environment (can be a boolean or a path string).
  - **Default:** `undefined`

- **`tools.shell.enableInteractiveShell`** (boolean):

  Use `node-pty` for an interactive shell experience. Fallback to `child_process` still applies. Defaults to `false`.

- **`tools.core`** (array of strings):
  - **Description:** This can be used to restrict the set of built-in tools [with an allowlist](../cli/enterprise.md#restricting-tool-access). See [Built-in Tools](../core/tools-api.md#built-in-tools) for a list of core tools. The match semantics are the same as `tools.allowed`.
  - **Default:** `undefined`

- **`tools.exclude`** (array of strings):
  - **Description:** Tool names to exclude from discovery.
  - **Default:** `undefined`

- **`tools.allowed`** (array of strings):
  - **Description:** A list of tool names that will bypass the confirmation dialog. This is useful for tools that you trust and use frequently. For example, `["run_shell_command(git)", "run_shell_command(npm test)"]` will skip the confirmation dialog to run any `git` and `npm test` commands. See [Shell Tool command restrictions](../tools/shell.md#command-restrictions) for details on prefix matching, command chaining, etc.
  - **Default:** `undefined`

- **`tools.discoveryCommand`** (string):
  - **Description:** Command to run for tool discovery.
  - **Default:** `undefined`

- **`tools.callCommand`** (string):
  - **Description:** Defines a custom shell command for calling a specific tool that was discovered using `tools.discoveryCommand`. The shell command must meet the following criteria:
    - It must take function `name` (exactly as in [function declaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)) as the first command line argument.
    - It must read function arguments as JSON on `stdin`, analogous to [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall).
    - It must return function output as JSON on `stdout`, analogous to [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse).
  - **Default:** `undefined`

#### `mcp`

- **`mcp.serverCommand`** (string):
  - **Description:** Command to start an MCP server.
  - **Default:** `undefined`

- **`mcp.allowed`** (array of strings):
  - **Description:** An allowlist of MCP servers to allow.
  - **Default:** `undefined`

- **`mcp.excluded`** (array of strings):
  - **Description:** A denylist of MCP servers to exclude.
  - **Default:** `undefined`

#### `security`

- **`security.folderTrust.enabled`** (boolean):
  - **Description:** Setting to track whether Folder trust is enabled.
  - **Default:** `false`

- **`security.auth.selectedType`** (string):
  - **Description:** The currently selected authentication type.
  - **Default:** `undefined`

- **`security.auth.enforcedType`** (string):
  - **Description:** The required auth type (useful for enterprises).
  - **Default:** `undefined`

- **`security.auth.useExternal`** (boolean):
  - **Description:** Whether to use an external authentication flow.
  - **Default:** `undefined`

#### `advanced`

- **`advanced.autoConfigureMemory`** (boolean):
  - **Description:** Automatically configure Node.js memory limits.
  - **Default:** `false`

- **`advanced.dnsResolutionOrder`** (string):
  - **Description:** The DNS resolution order.
  - **Default:** `undefined`

- **`advanced.excludedEnvVars`** (array of strings):
  - **Description:** Environment variables to exclude from project context.
  - **Default:** `["DEBUG","DEBUG_MODE"]`

- **`advanced.bugCommand`** (object):
  - **Description:** Configuration for the bug report command.
  - **Default:** `undefined`

#### `mcpServers`

Configures connections to one or more Model-Context Protocol (MCP) servers for discovering and using custom tools. Gemini CLI attempts to connect to each configured MCP server to discover available tools. If multiple MCP servers expose a tool with the same name, the tool names will be prefixed with the server alias you defined in the configuration (e.g., `serverAlias__actualToolName`) to avoid conflicts. Note that the system might strip certain schema properties from MCP tool definitions for compatibility. At least one of `command`, `url`, or `httpUrl` must be provided. If multiple are specified, the order of precedence is `httpUrl`, then `url`, then `command`.

- **`mcpServers.<SERVER_NAME>`** (object): The server parameters for the named server.
  - `command` (string, optional): The command to execute to start the MCP server via standard I/O.
  - `args` (array of strings, optional): Arguments to pass to the command.
  - `env` (object, optional): Environment variables to set for the server process.
  - `cwd` (string, optional): The working directory in which to start the server.
  - `url` (string, optional): The URL of an MCP server that uses Server-Sent Events (SSE) for communication.
  - `httpUrl` (string, optional): The URL of an MCP server that uses streamable HTTP for communication.
  - `headers` (object, optional): A map of HTTP headers to send with requests to `url` or `httpUrl`.
  - `timeout` (number, optional): Timeout in milliseconds for requests to this MCP server.
  - `trust` (boolean, optional): Trust this server and bypass all tool call confirmations.
  - `description` (string, optional): A brief description of the server, which may be used for display purposes.
  - `includeTools` (array of strings, optional): List of tool names to include from this MCP server. When specified, only the tools listed here will be available from this server (allowlist behavior). If not specified, all tools from the server are enabled by default.
  - `excludeTools` (array of strings, optional): List of tool names to exclude from this MCP server. Tools listed here will not be available to the model, even if they are exposed by the server. **Note:** `excludeTools` takes precedence over `includeTools` - if a tool is in both lists, it will be excluded.

#### `telemetry`

Configures logging and metrics collection for Gemini CLI. For more information, see [Telemetry](../cli/telemetry.md).

- **Properties:**
  - **`enabled`** (boolean): Whether or not telemetry is enabled.
  - **`target`** (string): The destination for collected telemetry. Supported values are `local` and `gcp`.
  - **`otlpEndpoint`** (string): The endpoint for the OTLP Exporter.
  - **`otlpProtocol`** (string): The protocol for the OTLP Exporter (`grpc` or `http`).
  - **`logPrompts`** (boolean): Whether or not to include the content of user prompts in the logs.
  - **`outfile`** (string): The file to write telemetry to when `target` is `local`.
  - **`useCollector`** (boolean): Whether to use an external OTLP collector.

### Example `settings.json`

Here is an example of a `settings.json` file with the nested structure, new as of v0.3.0:

```json
{
  "general": {
    "vimMode": true,
    "preferredEditor": "code"
  },
  "ui": {
    "theme": "GitHub",
    "hideBanner": true,
    "hideTips": false,
    "customWittyPhrases": [
      "You forget a thousand things every day. Make sure this is one of ’em",
      "Connecting to AGI"
    ]
  },
  "tools": {
    "sandbox": "docker",
    "discoveryCommand": "bin/get_tools",
    "callCommand": "bin/call_tool",
    "exclude": ["write_file"]
  },
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
  "privacy": {
    "usageStatisticsEnabled": true
  },
  "model": {
    "name": "gemini-1.5-pro-latest",
    "maxSessionTurns": 10,
    "summarizeToolOutput": {
      "run_shell_command": {
        "tokenBudget": 100
      }
    }
  },
  "context": {
    "fileName": ["CONTEXT.md", "GEMINI.md"],
    "includeDirectories": ["path/to/dir1", "~/path/to/dir2", "../path/to/dir3"],
    "loadFromIncludeDirectories": true,
    "fileFiltering": {
      "respectGitIgnore": false
    }
  },
  "advanced": {
    "excludedEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
  }
}
```

## Shell History

The CLI keeps a history of shell commands you run. To avoid conflicts between different projects, this history is stored in a project-specific directory within your user's home folder.

- **Location:** `~/.gemini/tmp/<project_hash>/shell_history`
  - `<project_hash>` is a unique identifier generated from your project's root path.
  - The history is stored in a file named `shell_history`.

## Environment Variables & `.env` Files

Environment variables are a common way to configure applications, especially for sensitive information like API keys or for settings that might change between environments. For authentication setup, see the [Authentication documentation](./authentication.md) which covers all available authentication methods.

The CLI automatically loads environment variables from an `.env` file. The loading order is:

1.  `.env` file in the current working directory.
2.  If not found, it searches upwards in parent directories until it finds an `.env` file or reaches the project root (identified by a `.git` folder) or the home directory.
3.  If still not found, it looks for `~/.env` (in the user's home directory).

**Environment Variable Exclusion:** Some environment variables (like `DEBUG` and `DEBUG_MODE`) are automatically excluded from being loaded from project `.env` files to prevent interference with gemini-cli behavior. Variables from `.gemini/.env` files are never excluded. You can customize this behavior using the `advanced.excludedEnvVars` setting in your `settings.json` file.

- **`GEMINI_API_KEY`**:
  - Your API key for the Gemini API.
  - One of several available [authentication methods](./authentication.md).
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
- **`GEMINI_TELEMETRY_ENABLED`**:
  - Set to `true` or `1` to enable telemetry. Any other value is treated as disabling it.
  - Overrides the `telemetry.enabled` setting.
- **`GEMINI_TELEMETRY_TARGET`**:
  - Sets the telemetry target (`local` or `gcp`).
  - Overrides the `telemetry.target` setting.
- **`GEMINI_TELEMETRY_OTLP_ENDPOINT`**:
  - Sets the OTLP endpoint for telemetry.
  - Overrides the `telemetry.otlpEndpoint` setting.
- **`GEMINI_TELEMETRY_OTLP_PROTOCOL`**:
  - Sets the OTLP protocol (`grpc` or `http`).
  - Overrides the `telemetry.otlpProtocol` setting.
- **`GEMINI_TELEMETRY_LOG_PROMPTS`**:
  - Set to `true` or `1` to enable or disable logging of user prompts. Any other value is treated as disabling it.
  - Overrides the `telemetry.logPrompts` setting.
- **`GEMINI_TELEMETRY_OUTFILE`**:
  - Sets the file path to write telemetry to when the target is `local`.
  - Overrides the `telemetry.outfile` setting.
- **`GEMINI_TELEMETRY_USE_COLLECTOR`**:
  - Set to `true` or `1` to enable or disable using an external OTLP collector. Any other value is treated as disabling it.
  - Overrides the `telemetry.useCollector` setting.
- **`GOOGLE_CLOUD_LOCATION`**:
  - Your Google Cloud Project Location (e.g., us-central1).
  - Required for using Vertex AI in non-express mode.
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
  - For scripting examples, use the `--output-format json` flag to get structured output.
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**):
  - Starts an interactive session with the provided prompt as the initial input.
  - The prompt is processed within the interactive session, not before it.
  - Cannot be used when piping input from stdin.
  - Example: `gemini -i "explain this code"`
- **`--output-format <format>`**:
  - **Description:** Specifies the format of the CLI output for non-interactive mode.
  - **Values:**
    - `text`: (Default) The standard human-readable output.
    - `json`: A machine-readable JSON output.
  - **Note:** For structured output and scripting, use the `--output-format json` flag.
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
- **`--allowed-tools <tool1,tool2,...>`**:
  - A comma-separated list of tool names that will bypass the confirmation dialog.
  - Example: `gemini --allowed-tools "ShellTool(git status)"`
- **`--telemetry`**:
  - Enables [telemetry](../cli/telemetry.md).
- **`--telemetry-target`**:
  - Sets the telemetry target. See [telemetry](../cli/telemetry.md) for more information.
- **`--telemetry-otlp-endpoint`**:
  - Sets the OTLP endpoint for telemetry. See [telemetry](../cli/telemetry.md) for more information.
- **`--telemetry-otlp-protocol`**:
  - Sets the OTLP protocol for telemetry (`grpc` or `http`). Defaults to `grpc`. See [telemetry](../cli/telemetry.md) for more information.
- **`--telemetry-log-prompts`**:
  - Enables logging of prompts for telemetry. See [telemetry](../cli/telemetry.md) for more information.
- **`--checkpointing`**:
  - Enables [checkpointing](../cli/checkpointing.md).
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
- **`--screen-reader`**:
  - Enables screen reader mode, which adjusts the TUI for better compatibility with screen readers.
- **`--version`**:
  - Displays the version of the CLI.

## Context Files (Hierarchical Instructional Context)

While not strictly configuration for the CLI's _behavior_, context files (defaulting to `GEMINI.md` but configurable via the `context.fileName` setting) are crucial for configuring the _instructional context_ (also referred to as "memory") provided to the Gemini model. This powerful feature allows you to give project-specific instructions, coding style guides, or any relevant background information to the AI, making its responses more tailored and accurate to your needs. The CLI includes UI elements, such as an indicator in the footer showing the number of loaded context files, to keep you informed about the active context.

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
      - Location: `~/.gemini/<configured-context-filename>` (e.g., `~/.gemini/GEMINI.md` in your user home directory).
      - Scope: Provides default instructions for all your projects.
  2.  **Project Root & Ancestors Context Files:**
      - Location: The CLI searches for the configured context file in the current working directory and then in each parent directory up to either the project root (identified by a `.git` folder) or your home directory.
      - Scope: Provides context relevant to the entire project or a significant portion of it.
  3.  **Sub-directory Context Files (Contextual/Local):**
      - Location: The CLI also scans for the configured context file in subdirectories _below_ the current working directory (respecting common ignore patterns like `node_modules`, `.git`, etc.). The breadth of this search is limited to 200 directories by default, but can be configured with the `context.discoveryMaxDirs` setting in your `settings.json` file.
      - Scope: Allows for highly specific instructions relevant to a particular component, module, or subsection of your project.
- **Concatenation & UI Indication:** The contents of all found context files are concatenated (with separators indicating their origin and path) and provided as part of the system prompt to the Gemini model. The CLI footer displays the count of loaded context files, giving you a quick visual cue about the active instructional context.
- **Importing Content:** You can modularize your context files by importing other Markdown files using the `@path/to/file.md` syntax. For more details, see the [Memory Import Processor documentation](../core/memport.md).
- **Commands for Memory Management:**
  - Use `/memory refresh` to force a re-scan and reload of all context files from all configured locations. This updates the AI's instructional context.
  - Use `/memory show` to display the combined instructional context currently loaded, allowing you to verify the hierarchy and content being used by the AI.
  - See the [Commands documentation](../cli/commands.md#memory) for full details on the `/memory` command and its sub-commands (`show` and `refresh`).

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

You can opt out of usage statistics collection at any time by setting the `usageStatisticsEnabled` property to `false` under the `privacy` category in your `settings.json` file:

```json
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```
