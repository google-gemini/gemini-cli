# Gemini CLI Server: Configuration

Configuration for the Gemini CLI server component (`packages/server`) is critical for its operation, dictating how it connects to the Gemini API, which model it uses, how tools are executed, and more. Many of these settings are shared with or derived from the main CLI configuration when the CLI initializes the server backend.

## Primary Configuration Sources

The server's configuration is primarily established when the `Config` object (from `packages/server/src/config/config.ts`) is instantiated. The values come from a combination of:

1.  **Hardcoded Defaults:** Fallback values defined within the server and CLI packages.
2.  **Settings Files (`settings.json` via CLI):** Persistent settings that the CLI reads (User settings `~/.gemini/settings.json`, then Workspace settings `.gemini/settings.json`) and then passes relevant parts to the server configuration.
3.  **Environment Variables (potentially from `.env` files):** System-wide or session-specific variables. The CLI loads `.env` files (checking current directory, then ancestors, then `~/.env`) and these variables influence the server config.
4.  **Command-Line Arguments (passed from CLI):** Settings chosen by the user at launch time, which have the highest precedence for many options.

## Key Configuration Parameters for the Server

These are the main pieces of information the server `Config` object holds and uses:

- **`apiKey` (string):**

  - **Source:** Primarily `process.env.GEMINI_API_KEY` (loaded from the environment or `.env` files).
  - **Importance:** Absolutely essential for connecting to the Gemini API. (If using Vertex AI, authentication is handled differently, typically via Application Default Credentials - see README.md).

- **`model` (string):**

  - **Source:** Command-line argument (`--model`), environment variable (`GEMINI_MODEL`), or a default value (e.g., `gemini-2.5-pro-preview-05-06`).
  - **Purpose:** Specifies which Gemini model the server should use. (For Vertex AI model names and usage, refer to the main README.md).

- **`sandbox` (boolean | string):**

  - **Source:** Command-line argument (`--sandbox`), environment variable (`GEMINI_SANDBOX`), or `settings.json` (`sandbox` key).
  - **Purpose:** Determines if and how tools (especially `execute_bash_command`) are sandboxed. This is crucial for security.
    - `true`: Use a default sandboxing method.
    - `false`: No sandboxing (less secure).
    - `"docker"`, `"podman"`, or a custom command string: Specific sandboxing method.

- **`targetDir` (string):**

  - **Source:** Typically `process.cwd()` (the current working directory from which the CLI was launched).
  - **Purpose:** Provides a base directory context for tools that operate on the file system (e.g., `read_file`, `list_directory`). Paths used in tool calls are often resolved relative to this directory.

- **`debugMode` (boolean):**

  - **Source:** Command-line argument (`--debug_mode`) or environment variables (e.g., `DEBUG=true`, `DEBUG_MODE=true`).
  - **Purpose:** Enables verbose logging within the server and its tools, which is helpful for development and troubleshooting.

- **`question` (string | undefined):**

  - **Source:** Command-line argument (`--question`), usually when input is piped to the CLI.
  - **Purpose:** Allows a direct question to be passed to the server for processing without interactive input.

- **`fullContext` (boolean):**

  - **Source:** Command-line argument (`--all_files`).
  - **Purpose:** If true, instructs relevant tools (like `read_many_files` when used implicitly by the model) to gather a broad context from the `targetDir`.

- **`toolDiscoveryCommand` (string | undefined):**

- `toolCallCommand` (string | undefined):
- `mcpServers` (object | undefined):
  - **Source:** `settings.json` (`mcpServers` key), passed from the CLI.
  - **Purpose:** Advanced setting for configuring connections to one or more Model-Context Protocol (MCP) servers. This allows the Gemini CLI to discover and utilize tools exposed by these external servers.
  - **Structure:** An object where each key is a unique server name (alias) and the value is an object containing:
    - `command` (string, required): The command to execute to start the MCP server.
    - `args` (array of strings, optional): Arguments for the command.
    - `env` (object, optional): Environment variables for the server process.
    - `cwd` (string, optional): Working directory for the server.
    - `timeout` (number, optional): Request timeout in milliseconds.
  - **Behavior:** The server will attempt to connect to each configured MCP server. Tool names from these servers might be prefixed with the server alias to prevent naming collisions. The server may also adapt tool schemas from MCP servers for internal compatibility.
- `mcpServerCommand` (string | undefined, **deprecated**):

  - **Source:** `settings.json` (`mcpServerCommand` key).
  - **Purpose:** Legacy setting for a single MCP server. Superseded by `mcpServers`.

- `userAgent` (string):

  - **Source:** Automatically generated by the CLI, often including CLI package name, version, and Node.js environment details.
  - **Purpose:** Sent with API requests to help identify the client making requests to the Gemini API.

- **`userMemory` (string):**

  - **Source:** Loaded from the hierarchical `GEMINI.md` files by the CLI (Global, Project Root/Ancestors, Sub-directory) and passed to the server config.
  - **Purpose:** Contains the combined instructional context provided to the Gemini model.
  - **Mutability:** This can be updated if the memory is refreshed by the user (e.g., via the `/memory refresh` command in the CLI).

- **`geminiMdFileCount` (number):**
  - **Source:** Count of all `GEMINI.md` files successfully loaded by the CLI.
  - **Purpose:** Metadata about the loaded instructional context, visible in the CLI footer.

## Environment File (`.env`) Loading

The CLI configuration logic, which precedes server initialization, includes loading an `.env` file. The search order is:

1.  `.env` in the current working directory.
2.  `.env` in parent directories, up to the project root (containing `.git`) or home directory.
3.  `~/.env` (in the user's home directory).

This file is a common place to store the `GEMINI_API_KEY` and other environment-specific settings like `GEMINI_MODEL` or `DEBUG` flags.

```
# Example .env file
GEMINI_API_KEY="YOUR_ACTUAL_API_KEY_HERE"
GEMINI_MODEL="gemini-1.5-flash-latest"
# DEBUG=true
```

## Tool Registry Initialization

Upon initialization, the server's `Config` object is also used to create and populate a `ToolRegistry`. This registry is then aware of the `targetDir` and `sandbox` settings, which are vital for the correct and secure operation of tools like `ReadFileTool`, `ShellTool`, etc. The `ToolRegistry` is responsible for making tool schemas available to the Gemini model and for executing tool calls.

Proper server configuration, derived from these various sources, is essential for the Gemini CLI to function correctly, securely, and according to the user's intent.
