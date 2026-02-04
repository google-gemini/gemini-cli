# CLI cheatsheet

This page provides a reference for commonly used Gemini CLI commands, options,
and parameters.

## CLI commands

| Command                            | Description                        | Example                                             |
| ---------------------------------- | ---------------------------------- | --------------------------------------------------- |
| `gemini`                           | Start interactive REPL             | `gemini`                                            |
| `gemini "query"`                   | Query non-interactively, then exit | `gemini "explain this project"`                     |
| `gemini -p "query"`                | Query via SDK, then exit           | `gemini -p "explain this function"`                 |
| `cat file \| gemini -p "query"`    | Process piped content              | `cat logs.txt \| gemini -p "explain"`               |
| `gemini -i "query"`                | Execute and continue interactively | `gemini -i "What is the purpose of this project?"`  |
| `gemini -r "latest"`               | Continue most recent session       | `gemini -r "latest"`                                |
| `gemini -r "latest" "query"`       | Continue session with a new prompt | `gemini -r "latest" "Check for type errors"`        |
| `gemini -r "<session-id>" "query"` | Resume session by ID               | `gemini -r "abc123" "Finish this PR"`               |
| `gemini update`                    | Update to latest version           | `gemini update`                                     |
| `gemini extensions`                | Manage extensions                  | See [Extensions Management](#extensions-management) |
| `gemini mcp`                       | Configure MCP servers              | See [MCP Server Management](#mcp-server-management) |

### Positional arguments

| Argument | Type              | Description                                                                                                        |
| -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `query`  | string (variadic) | Positional prompt. Defaults to one-shot mode. Use `-i/--prompt-interactive` to execute and continue interactively. |

## CLI Options

| Option                           | Alias | Type    | Default   | Description                                                                                                |
| -------------------------------- | ----- | ------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| `--debug`                        | `-d`  | boolean | `false`   | Run in debug mode with verbose logging                                                                     |
| `--version`                      | `-v`  | -       | -         | Show CLI version number and exit                                                                           |
| `--help`                         | `-h`  | -       | -         | Show help information                                                                                      |
| `--model`                        | `-m`  | string  | `auto`    | Model to use. See [Model Selection](#model-selection) for available values.                                |
| `--prompt`                       | `-p`  | string  | -         | Prompt text. Appended to stdin input if provided. **Deprecated:** Use positional arguments instead.        |
| `--prompt-interactive`           | `-i`  | string  | -         | Execute prompt and continue in interactive mode                                                            |
| `--sandbox`                      | `-s`  | boolean | `false`   | Run in a sandboxed environment for safer execution                                                         |
| `--approval-mode`                | -     | string  | `default` | Approval mode for tool execution. Choices: `default`, `auto_edit`, `yolo`                                  |
| `--yolo`                         | `-y`  | boolean | `false`   | **Deprecated.** Auto-approve all actions. Use `--approval-mode=yolo` instead.                              |
| `--experimental-acp`             | -     | boolean | -         | Start in ACP (Agent Code Pilot) mode. **Experimental feature.**                                            |
| `--experimental-zed-integration` | -     | boolean | -         | Run in Zed editor integration mode. **Experimental feature.**                                              |
| `--allowed-mcp-server-names`     | -     | array   | -         | Allowed MCP server names (comma-separated or multiple flags)                                               |
| `--allowed-tools`                | -     | array   | -         | Tools that are allowed to run without confirmation (comma-separated or multiple flags)                     |
| `--extensions`                   | `-e`  | array   | -         | List of extensions to use. If not provided, all extensions are enabled (comma-separated or multiple flags) |
| `--list-extensions`              | `-l`  | boolean | -         | List all available extensions and exit                                                                     |
| `--resume`                       | `-r`  | string  | -         | Resume a previous session. Use `"latest"` for most recent or index number (e.g. `--resume 5`)              |
| `--list-sessions`                | -     | boolean | -         | List available sessions for the current project and exit                                                   |
| `--delete-session`               | -     | string  | -         | Delete a session by index number (use `--list-sessions` to see available sessions)                         |
| `--include-directories`          | -     | array   | -         | Additional directories to include in the workspace (comma-separated or multiple flags)                     |
| `--screen-reader`                | -     | boolean | -         | Enable screen reader mode for accessibility                                                                |
| `--output-format`                | `-o`  | string  | `text`    | The format of the CLI output. Choices: `text`, `json`, `stream-json`                                       |

## Model selection

The `--model` (or `-m`) flag allows you to specify which Gemini model to use.
You can use either model aliases (user-friendly names) or concrete model names.

### Model aliases

These are convenient shortcuts that map to specific models:

| Alias        | Resolves To                                | Description                                                                                                               |
| ------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `auto`       | `gemini-2.5-pro` or `gemini-3-pro-preview` | **Default.** Resolves to the preview model if preview features are enabled, otherwise resolves to the standard pro model. |
| `pro`        | `gemini-2.5-pro` or `gemini-3-pro-preview` | For complex reasoning tasks. Uses preview model if enabled.                                                               |
| `flash`      | `gemini-2.5-flash`                         | Fast, balanced model for most tasks.                                                                                      |
| `flash-lite` | `gemini-2.5-flash-lite`                    | Fastest model for simple tasks.                                                                                           |

## Extensions management

| Command                                            | Description                                  | Example                                                                        |
| -------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| `gemini extensions install <source>`               | Install extension from Git URL or local path | `gemini extensions install https://github.com/user/my-extension`               |
| `gemini extensions install <source> --ref <ref>`   | Install from specific branch/tag/commit      | `gemini extensions install https://github.com/user/my-extension --ref develop` |
| `gemini extensions install <source> --auto-update` | Install with auto-update enabled             | `gemini extensions install https://github.com/user/my-extension --auto-update` |
| `gemini extensions uninstall <name>`               | Uninstall one or more extensions             | `gemini extensions uninstall my-extension`                                     |
| `gemini extensions list`                           | List all installed extensions                | `gemini extensions list`                                                       |
| `gemini extensions update <name>`                  | Update a specific extension                  | `gemini extensions update my-extension`                                        |
| `gemini extensions update --all`                   | Update all extensions                        | `gemini extensions update --all`                                               |
| `gemini extensions enable <name>`                  | Enable an extension                          | `gemini extensions enable my-extension`                                        |
| `gemini extensions disable <name>`                 | Disable an extension                         | `gemini extensions disable my-extension`                                       |
| `gemini extensions link <path>`                    | Link local extension for development         | `gemini extensions link /path/to/extension`                                    |
| `gemini extensions new <path>`                     | Create new extension from template           | `gemini extensions new ./my-extension`                                         |
| `gemini extensions validate <path>`                | Validate extension structure                 | `gemini extensions validate ./my-extension`                                    |

See [Extensions Documentation](../extensions/index.md) for more details.

## MCP server management

| Command                                                       | Description                     | Example                                                                                              |
| ------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `gemini mcp add <name> <command>`                             | Add stdio-based MCP server      | `gemini mcp add github npx -y @modelcontextprotocol/server-github`                                   |
| `gemini mcp add <name> <url> --transport http`                | Add HTTP-based MCP server       | `gemini mcp add api-server http://localhost:3000 --transport http`                                   |
| `gemini mcp add <name> <command> --env KEY=value`             | Add with environment variables  | `gemini mcp add slack node server.js --env SLACK_TOKEN=xoxb-xxx`                                     |
| `gemini mcp add <name> <command> --scope user`                | Add with user scope             | `gemini mcp add db node db-server.js --scope user`                                                   |
| `gemini mcp add <name> <command> --include-tools tool1,tool2` | Add with specific tools         | `gemini mcp add github npx -y @modelcontextprotocol/server-github --include-tools list_repos,get_pr` |
| `gemini mcp remove <name>`                                    | Remove an MCP server            | `gemini mcp remove github`                                                                           |
| `gemini mcp list`                                             | List all configured MCP servers | `gemini mcp list`                                                                                    |

See [MCP Server Integration](../tools/mcp-server.md) for more details.

## Skills management

| Command                          | Description                           | Example                                           |
| -------------------------------- | ------------------------------------- | ------------------------------------------------- |
| `gemini skills list`             | List all discovered agent skills      | `gemini skills list`                              |
| `gemini skills install <source>` | Install skill from Git, path, or file | `gemini skills install https://github.com/u/repo` |
| `gemini skills link <path>`      | Link local agent skills via symlink   | `gemini skills link /path/to/my-skills`           |
| `gemini skills uninstall <name>` | Uninstall an agent skill              | `gemini skills uninstall my-skill`                |
| `gemini skills enable <name>`    | Enable an agent skill                 | `gemini skills enable my-skill`                   |
| `gemini skills disable <name>`   | Disable an agent skill                | `gemini skills disable my-skill`                  |
| `gemini skills enable --all`     | Enable all skills                     | `gemini skills enable --all`                      |
| `gemini skills disable --all`    | Disable all skills                    | `gemini skills disable --all`                     |

See [Agent Skills Documentation](./skills.md) for more details.
