# Gemini CLI Command Audit

This document outlines the commands and flags for the Node.js `gemini-cli`.

## Main Command (`$0`)

The default command for interactive and non-interactive use.

### Options

- `--model, -m`: (string) The model to use.
- `--prompt, -p`: (string) The prompt to use (non-interactive).
- `--prompt-interactive, -i`: (string) Execute a prompt and then enter interactive mode.
- `--sandbox, -s`: (boolean) Run in a sandbox.
- `--sandbox-image`: (string) The sandbox image to use.
- `--all-files, -a`: (boolean) Include all files in the context.
- `--show-memory-usage`: (boolean) Show memory usage in the status bar.
- `--yolo, -y`: (boolean) Automatically accept all actions.
- `--approval-mode`: (string) Set the approval mode (`default`, `auto_edit`, `yolo`).
- `--checkpointing, -c`: (boolean) Enable checkpointing of file edits.
- `--experimental-acp`: (boolean) Start the agent in ACP mode.
- `--allowed-mcp-server-names`: (array) Allowed MCP server names.
- `--allowed-tools`: (array) Tools that are allowed to run without confirmation.
- `--extensions, -e`: (array) A list of extensions to use.
- `--list-extensions, -l`: (boolean) List all available extensions and exit.
- `--include-directories`: (array) Additional directories to include in the workspace.
- `--screen-reader`: (boolean) Enable screen reader mode.
- `--output-format, -o`: (string) The format of the CLI output (`text`, `json`).
- `[promptWords...]`: (array) A positional argument for the prompt.

### Deprecated Telemetry Options

- `--telemetry`: (boolean)
- `--telemetry-target`: (string)
- `--telemetry-otlp-endpoint`: (string)
- `--telemetry-otlp-protocol`: (string)
- `--telemetry-log-prompts`: (boolean)
- `--telemetry-outfile`: (string)

## Subcommands

### `mcp`

- Manages MCP (Model Context Protocol) servers.
- Further investigation of `packages/cli/src/commands/mcp.ts` is needed.

### `mcp`

- Manages MCP (Model Context Protocol) servers.

#### `add <name> <commandOrUrl> [args...]`

- Adds a new MCP server configuration.
- **Options:**
  - `--scope, -s`: (string) `user` or `project`
  - `--transport, -t`: (string) `stdio`, `sse`, or `http`
  - `--env, -e`: (array) Environment variables for `stdio` transport.
  - `--header, -H`: (array) HTTP headers for `sse` and `http` transports.
  - `--timeout`: (number) Connection timeout in milliseconds.
  - `--trust`: (boolean) Trust the server and bypass tool call confirmations.
  - `--description`: (string) A description for the server.
  - `--include-tools`: (array) A comma-separated list of tools to include.
  - `--exclude-tools`: (array) A comma-separated list of tools to exclude.

#### `remove <name>`

- Removes an MCP server configuration.
- **Options:**
  - `--scope, -s`: (string) `user` or `project`

#### `list`

- Lists all configured MCP servers and their connection status.

### `extensions`

- Manages CLI extensions.

#### `install <name>`

- Installs an extension from a registry.

#### `uninstall <name>`

- Uninstalls an extension.

#### `list`

- Lists all installed extensions.

#### `update [name]`

- Updates a specific extension or all extensions if no name is provided.

#### `disable <name>`

- Disables an extension.

#### `enable <name>`

- Enables a disabled extension.

#### `link [path]`

- Links a local directory as an extension.

#### `new`

- Creates a new extension from a template.