# Extensions reference

This guide covers the `gemini extensions` commands and the structure of the
`gemini-extension.json` configuration file.

## Extension management

We offer a suite of extension management tools using `gemini extensions`
commands.

Note that these commands (e.g. `gemini extensions install`) are not supported
from within the CLI's **interactive mode**, although you can list installed
extensions using the `/extensions list` slash command.

Note that all of these management operations (including updates to slash
commands) will only be reflected in active CLI sessions on **restart**.

### Installing an extension

You can install an extension using `gemini extensions install` with either a
GitHub URL or a local path.

Note that we create a copy of the installed extension, so you will need to run
`gemini extensions update` to pull in changes from both locally-defined
extensions and those on GitHub.

NOTE: If you are installing an extension from GitHub, you'll need to have `git`
installed on your machine. See
[git installation instructions](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
for help.

```
gemini extensions install <source> [--ref <ref>] [--auto-update] [--pre-release] [--consent]
```

- `<source>`: The github URL or local path of the extension to install.
- `--ref`: The git ref to install from.
- `--auto-update`: Enable auto-update for this extension.
- `--pre-release`: Enable pre-release versions for this extension.
- `--consent`: Acknowledge the security risks of installing an extension and
  skip the confirmation prompt.

### Uninstalling an extension

To uninstall one or more extensions, run
`gemini extensions uninstall <name...>`:

```
gemini extensions uninstall gemini-cli-security gemini-cli-another-extension
```

### Disabling an extension

Extensions are, by default, enabled across all workspaces. You can disable an
extension entirely or for specific workspace.

```
gemini extensions disable <name> [--scope <scope>]
```

- `<name>`: The name of the extension to disable.
- `--scope`: The scope to disable the extension in (`user` or `workspace`).

### Enabling an extension

You can enable extensions using `gemini extensions enable <name>`. You can also
enable an extension for a specific workspace using
`gemini extensions enable <name> --scope=workspace` from within that workspace.

```
gemini extensions enable <name> [--scope <scope>]
```

- `<name>`: The name of the extension to enable.
- `--scope`: The scope to enable the extension in (`user` or `workspace`).

### Updating an extension

For extensions installed from a local path or a git repository, you can
explicitly update to the latest version (as reflected in the
`gemini-extension.json` `version` field) with `gemini extensions update <name>`.

You can update all extensions with:

```
gemini extensions update --all
```

### Create a boilerplate extension

We offer several example extensions `context`, `custom-commands`,
`exclude-tools` and `mcp-server`. You can view these examples
[here](https://github.com/google-gemini/gemini-cli/tree/main/packages/cli/src/commands/extensions/examples).

To copy one of these examples into a development directory using the type of
your choosing, run:

```
gemini extensions new <path> [template]
```

- `<path>`: The path to create the extension in.
- `[template]`: The boilerplate template to use.

### Link a local extension

The `gemini extensions link` command will create a symbolic link from the
extension installation directory to the development path.

This is useful so you don't have to run `gemini extensions update` every time
you make changes you'd like to test.

```
gemini extensions link <path>
```

- `<path>`: The path of the extension to link.

## Extension format

On startup, Gemini CLI looks for extensions in `<home>/.gemini/extensions`

Extensions exist as a directory that contains a `gemini-extension.json` file.
For example:

`<home>/.gemini/extensions/my-extension/gemini-extension.json`

### `gemini-extension.json`

The `gemini-extension.json` file contains the configuration for the extension.
The file has the following structure:

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

- `name`: The name of the extension. This is used to uniquely identify the
  extension and for conflict resolution when extension commands have the same
  name as user or project commands. The name should be lowercase or numbers and
  use dashes instead of underscores or spaces. This is how users will refer to
  your extension in the CLI. Note that we expect this name to match the
  extension directory name.
- `version`: The version of the extension.
- `description`: A short description of the extension. This will be displayed on
  [geminicli.com/extensions](https://geminicli.com/extensions).
- `mcpServers`: A map of MCP servers to settings. The key is the name of the
  server, and the value is the server configuration. These servers will be
  loaded on startup just like MCP servers settingsd in a
  [`settings.json` file](../get-started/configuration.md). If both an extension
  and a `settings.json` file settings an MCP server with the same name, the
  server defined in the `settings.json` file takes precedence.
  - Note that all MCP server configuration options are supported except for
    `trust`.
- `contextFileName`: The name of the file that contains the context for the
  extension. This will be used to load the context from the extension directory.
  If this property is not used but a `GEMINI.md` file is present in your
  extension directory, then that file will be loaded.
- `excludeTools`: An array of tool names to exclude from the model. You can also
  specify command-specific restrictions for tools that support it, like the
  `run_shell_command` tool. For example,
  `"excludeTools": ["run_shell_command(rm -rf)"]` will block the `rm -rf`
  command. Note that this differs from the MCP server `excludeTools`
  functionality, which can be listed in the MCP server config.

When Gemini CLI starts, it loads all the extensions and merges their
configurations. If there are any conflicts, the workspace configuration takes
precedence.

### Settings

_Note: This is an experimental feature. We do not yet recommend extension
authors introduce settings as part of their core flows._

Extensions can define settings that the user will be prompted to provide upon
installation. This is useful for things like API keys, URLs, or other
configuration that the extension needs to function.

To define settings, add a `settings` array to your `gemini-extension.json` file.
Each object in the array should have the following properties:

- `name`: A user-friendly name for the setting.
- `description`: A description of the setting and what it's used for.
- `envVar`: The name of the environment variable that the setting will be stored
  as.
- `sensitive`: Optional boolean. If true, obfuscates the input the user provides
  and stores the secret in keychain storage. **Example**

```json
{
  "name": "my-api-extension",
  "version": "1.0.0",
  "settings": [
    {
      "name": "API Key",
      "description": "Your API key for the service.",
      "envVar": "MY_API_KEY"
    }
  ]
}
```

When a user installs this extension, they will be prompted to enter their API
key. The value will be saved to a `.env` file in the extension's directory
(e.g., `<home>/.gemini/extensions/my-api-extension/.env`).

You can view a list of an extension's settings by running:

```
gemini extensions list
```

and you can update a given setting using:

```
gemini extensions config <extension name> [setting name] [--scope <scope>]
```

- `--scope`: The scope to set the setting in (`user` or `workspace`). This is
  optional and will default to `user`.

### Custom commands

Extensions can provide [custom commands](../cli/custom-commands.md) by placing
TOML files in a `commands/` subdirectory within the extension directory. These
commands follow the same format as user and project custom commands and use
standard naming conventions.

**Example**

An extension named `gcp` with the following structure:

```
.gemini/extensions/gcp/
├── gemini-extension.json
└── commands/
    ├── deploy.toml
    └── gcs/
        └── sync.toml
```

Would provide these commands:

- `/deploy` - Shows as `[gcp] Custom command from deploy.toml` in help
- `/gcs:sync` - Shows as `[gcp] Custom command from sync.toml` in help

### Hooks

Extensions can provide [hooks](../hooks/index.md) to intercept and customize
Gemini CLI behavior at specific lifecycle events. Hooks provided by an extension
must be defined in a `hooks/hooks.json` file within the extension directory.

> [!IMPORTANT] Hooks are not defined directly in `gemini-extension.json`. The
> CLI specifically looks for the `hooks/hooks.json` file.

### Agent Skills

Extensions can bundle [Agent Skills](../cli/skills.md) to provide specialized
workflows. Skills must be placed in a `skills/` directory within the extension.

**Example**

An extension with the following structure:

```
.gemini/extensions/my-extension/
├── gemini-extension.json
└── skills/
    └── security-audit/
        └── SKILL.md
```

Will expose a `security-audit` skill that the model can activate.

### Sub-agents

> **Note: Sub-agents are currently an experimental feature.**

Extensions can provide [sub-agents](../core/subagents.md) that users can
delegate tasks to.

To bundle sub-agents with your extension, create an `agents/` directory in your
extension's root folder and add your agent definition files (`.md`) there.

**Example**

```
.gemini/extensions/my-extension/
├── gemini-extension.json
└── agents/
    ├── security-auditor.md
    └── database-expert.md
```

Gemini CLI will automatically discover and load these agents when the extension
is installed and enabled.

### Conflict resolution

Extension commands have the lowest precedence. When a conflict occurs with user
or project commands:

1. **No conflict**: Extension command uses its natural name (e.g., `/deploy`)
2. **With conflict**: Extension command is renamed with the extension prefix
   (e.g., `/gcp.deploy`)

For example, if both a user and the `gcp` extension define a `deploy` command:

- `/deploy` - Executes the user's deploy command
- `/gcp.deploy` - Executes the extension's deploy command (marked with `[gcp]`
  tag)

## Variables

Gemini CLI extensions allow variable substitution in both
`gemini-extension.json` and `hooks/hooks.json`. This can be useful if e.g., you
need the current directory to run an MCP server using an argument like
`"args": ["${extensionPath}${/}dist${/}server.js"]`.

**Supported variables:**

| variable                   | description                                                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | The fully-qualified path of the extension in the user's filesystem e.g., '/Users/username/.gemini/extensions/example-extension'. This will not unwrap symlinks. |
| `${workspacePath}`         | The fully-qualified path of the current workspace.                                                                                                              |
| `${/} or ${pathSeparator}` | The path separator (differs per OS).                                                                                                                            |
