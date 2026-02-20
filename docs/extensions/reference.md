# Extension reference

This guide covers the `gemini extensions` commands and the structure of the
`gemini-extension.json` configuration file.

## Manage extensions

Use the `gemini extensions` command group to manage your extensions from the
terminal.

Note that commands like `gemini extensions install` are not supported within the
CLI's interactive mode. However, you can use the `/extensions list` command to
view installed extensions. All management operations, including updates to slash
commands, take effect only after you restart the CLI session.

### Install an extension

Install an extension by providing its GitHub repository URL or a local file
path.

Gemini CLI creates a copy of the extension during installation. You must run
`gemini extensions update` to pull changes from the source. To install from
GitHub, you must have `git` installed on your machine.

```bash
gemini extensions install <source> [--ref <ref>] [--auto-update] [--pre-release] [--consent]
```

- `<source>`: The GitHub URL or local path of the extension.
- `--ref`: The git ref (branch, tag, or commit) to install.
- `--auto-update`: Enable automatic updates for this extension.
- `--pre-release`: Enable installation of pre-release versions.
- `--consent`: Acknowledge security risks and skip the confirmation prompt.

### Uninstall an extension

To uninstall one or more extensions, use the `uninstall` command:

```bash
gemini extensions uninstall <name...>
```

### Disable an extension

Extensions are enabled globally by default. You can disable an extension
entirely or for a specific workspace.

```bash
gemini extensions disable <name> [--scope <scope>]
```

- `<name>`: The name of the extension to disable.
- `--scope`: The scope to disable the extension in (`user` or `workspace`).

### Enable an extension

Re-enable a disabled extension using the `enable` command:

```bash
gemini extensions enable <name> [--scope <scope>]
```

- `<name>`: The name of the extension to enable.
- `--scope`: The scope to enable the extension in (`user` or `workspace`).

### Update an extension

Update an extension to the version specified in its `gemini-extension.json`
file.

```bash
gemini extensions update <name>
```

To update all installed extensions at once:

```bash
gemini extensions update --all
```

### Create an extension from a template

Create a new extension directory using a built-in template.

```bash
gemini extensions new <path> [template]
```

- `<path>`: The directory to create.
- `[template]`: The template to use (e.g., `mcp-server`, `context`,
  `custom-commands`).

### Link a local extension

Create a symbolic link between your development directory and the Gemini CLI
extensions directory. This lets you test changes immediately without
reinstalling.

```bash
gemini extensions link <path>
```

## Extension format

Gemini CLI loads extensions from `<home>/.gemini/extensions`. Each extension
must have a `gemini-extension.json` file in its root directory.

### `gemini-extension.json`

The manifest file defines the extension's behavior and configuration.

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "description": "My awesome extension",
  "mcpServers": {
    "my-server": {
      "command": "node my-server.js"
    }
  },
  "contextFileName": "GEMINI.md",
  "excludeTools": ["run_shell_command"]
}
```

- `name`: A unique identifier for the extension. Use lowercase letters, numbers,
  and dashes. This name must match the extension's directory name.
- `version`: The current version of the extension.
- `description`: A short summary shown in the extension gallery.
- <a id="mcp-servers"></a>`mcpServers`: A map of Model Context Protocol (MCP)
  servers. Extension servers follow the same format as standard
  [CLI configuration](../reference/configuration.md).
- `contextFileName`: The name of the context file (defaults to `GEMINI.md`). Can
  also be an array of strings to load multiple context files.
- `excludeTools`: An array of tools to block from the model. You can restrict
  specific arguments, such as `run_shell_command(rm -rf)`.
- `themes`: An optional list of themes provided by the extension. See
  [Themes](../cli/themes.md) for more information.

### Extension settings

Extensions can define settings that users provide during installation, such as
API keys or URLs. These values are stored in a `.env` file within the extension
directory.

To define settings, add a `settings` array to your manifest:

```json
{
  "name": "my-api-extension",
  "version": "1.0.0",
  "settings": [
    {
      "name": "API Key",
      "description": "Your API key for the service.",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ]
}
```

- `name`: The setting's display name.
- `description`: A clear explanation of the setting.
- `envVar`: The environment variable name where the value is stored.
- `sensitive`: If `true`, the value is stored in the system keychain and
  obfuscated in the UI.

To update an extension's settings:

```bash
gemini extensions config <name> [setting] [--scope <scope>]
```

### Custom commands

Provide [custom commands](../cli/custom-commands.md) by placing TOML files in a
`commands/` subdirectory. Gemini CLI uses the directory structure to determine
the command name.

For an extension named `gcp`:

- `commands/deploy.toml` becomes `/deploy`
- `commands/gcs/sync.toml` becomes `/gcs:sync` (namespaced with a colon)

### Hooks

Intercept and customize CLI behavior using [hooks](../hooks/index.md). Define
hooks in a `hooks/hooks.json` file within your extension directory. Note that
hooks are not defined in the `gemini-extension.json` manifest.

### Agent skills

Bundle [agent skills](../cli/skills.md) to provide specialized workflows. Place
skill definitions in a `skills/` directory. For example,
`skills/security-audit/SKILL.md` exposes a `security-audit` skill.

### Sub-agents

> **Note:** Sub-agents are a preview feature currently under active development.

Provide [sub-agents](../core/subagents.md) that users can delegate tasks to. Add
agent definition files (`.md`) to an `agents/` directory in your extension root.

### Themes

Extensions can provide custom themes to personalize the CLI UI. Themes are
defined in the `themes` array in `gemini-extension.json`.

**Example**

```json
{
  "name": "my-green-extension",
  "version": "1.0.0",
  "themes": [
    {
      "name": "shades-of-green",
      "type": "custom",
      "background": {
        "primary": "#1a362a"
      },
      "text": {
        "primary": "#a6e3a1",
        "secondary": "#6e8e7a",
        "link": "#89e689"
      },
      "status": {
        "success": "#76c076",
        "warning": "#d9e689",
        "error": "#b34e4e"
      },
      "border": {
        "default": "#4a6c5a"
      },
      "ui": {
        "comment": "#6e8e7a"
      }
    }
  ]
}
```

Custom themes provided by extensions can be selected using the `/theme` command
or by setting the `ui.theme` property in your `settings.json` file. Note that
when referring to a theme from an extension, the extension name is appended to
the theme name in parentheses, e.g., `shades-of-green (my-green-extension)`.

### Conflict resolution

Extension commands have the lowest precedence. If an extension command name
conflicts with a user or project command, the extension command is prefixed with
the extension name (e.g., `/gcp.deploy`) using a dot separator.

## Variables

Gemini CLI supports variable substitution in `gemini-extension.json` and
`hooks/hooks.json`.

| Variable           | Description                                     |
| :----------------- | :---------------------------------------------- |
| `${extensionPath}` | The absolute path to the extension's directory. |
| `${workspacePath}` | The absolute path to the current workspace.     |
| `${/}`             | The platform-specific path separator.           |
