# Shell tool (`run_shell_command`)

The `run_shell_command` tool allows the Gemini model to execute commands
directly on your system's shell. It is the primary mechanism for the agent to
interact with your environment beyond simple file edits.

## Technical reference

On Windows, commands execute with `powershell.exe -NoProfile -Command`. On other
platforms, they execute with `bash -c`.

### Arguments

- `command` (string, required): The exact shell command to execute.
- `description` (string, optional): A brief description shown to the user for
  confirmation.
- `dir_path` (string, optional): The absolute path or relative path from
  workspace root where the command runs.
- `is_background` (boolean, optional): Whether to move the process to the
  background immediately after starting.

### Return values

The tool returns a JSON object containing:

- `Command`: The executed string.
- `Directory`: The execution path.
- `Stdout` / `Stderr`: The output streams.
- `Exit Code`: The process return code.
- `Background PIDs`: PIDs of any started background processes.

## Configuration

You can configure the behavior of the `run_shell_command` tool by modifying your
`settings.json` file or by using the `/settings` command in the Gemini CLI.

### Enabling interactive commands

To enable interactive commands, you need to set the
`tools.shell.enableInteractiveShell` setting to `true`. This will use `node-pty`
for shell command execution, which allows for interactive sessions. If
`node-pty` is not available, it will fall back to the `child_process`
implementation, which does not support interactive commands.

**Example `settings.json`:**

```json
{
  "tools": {
    "shell": {
      "enableInteractiveShell": true
    }
  }
}
```

### Showing color in output

To show color in the shell output, you need to set the `tools.shell.showColor`
setting to `true`. **Note: This setting only applies when
`tools.shell.enableInteractiveShell` is enabled.**

**Example `settings.json`:**

```json
{
  "tools": {
    "shell": {
      "showColor": true
    }
  }
}
```

### Setting the pager

You can set a custom pager for the shell output by setting the
`tools.shell.pager` setting. The default pager is `cat`. **Note: This setting
only applies when `tools.shell.enableInteractiveShell` is enabled.**

**Example `settings.json`:**

```json
{
  "tools": {
    "shell": {
      "pager": "less"
    }
  }
}
```

## Interactive commands

The `run_shell_command` tool now supports interactive commands by integrating a
pseudo-terminal (pty). This allows you to run commands that require real-time
user input, such as text editors (`vim`, `nano`), terminal-based UIs (`htop`),
and interactive version control operations (`git rebase -i`).

When an interactive command is running, you can send input to it from the Gemini
CLI. To focus on the interactive shell, press `Tab`. The terminal output,
including complex TUIs, will be rendered correctly.

## Important notes

- **Security:** Be cautious when executing commands, especially those
  constructed from user input, to prevent security vulnerabilities.
- **Error handling:** Check the `Stderr`, `Error`, and `Exit Code` fields to
  determine if a command executed successfully.
- **Background processes:** When a command is run in the background with `&`,
  the tool will return immediately and the process will continue to run in the
  background. The `Background PIDs` field will contain the process ID of the
  background process.

## Environment variables

When `run_shell_command` executes a command, it sets the `GEMINI_CLI=1`
environment variable in the subprocess's environment. This allows scripts or
tools to detect if they are being run from within the Gemini CLI.

## Command restrictions

You can restrict the commands that can be executed by the `run_shell_command`
tool by using the `tools.core` and `tools.exclude` settings in your
configuration file.

- `tools.core`: To restrict `run_shell_command` to a specific set of commands,
  add entries to the `core` list under the `tools` category in the format
  `run_shell_command(<command>)`. For example,
  `"tools": {"core": ["run_shell_command(git)"]}` will only allow `git`
  commands. Including the generic `run_shell_command` acts as a wildcard,
  allowing any command not explicitly blocked.
- `tools.exclude` [DEPRECATED]: To block specific commands, use the
  [Policy Engine](../reference/policy-engine.md). Historically, this setting
  allowed adding entries to the `exclude` list under the `tools` category in the
  format `run_shell_command(<command>)`. For example,
  `"tools": {"exclude": ["run_shell_command(rm)"]}` will block `rm` commands.

The validation logic is designed to be secure and flexible:

1.  **Command chaining disabled**: The tool automatically splits commands
    chained with `&&`, `||`, or `;` and validates each part separately. If any
    part of the chain is disallowed, the entire command is blocked.
2.  **Prefix matching**: The tool uses prefix matching. For example, if you
    allow `git`, you can run `git status` or `git log`.
3.  **Blocklist precedence**: The `tools.exclude` list is always checked first.
    If a command matches a blocked prefix, it will be denied, even if it also
    matches an allowed prefix in `tools.core`.

### Command restriction examples

**Allow only specific command prefixes**

To allow only `git` and `npm` commands, and block all others:

```json
{
  "tools": {
    "core": ["run_shell_command(git)", "run_shell_command(npm)"]
  }
}
```

- `git status`: Allowed
- `npm install`: Allowed
- `ls -l`: Blocked

**Block specific command prefixes**

To block `rm` and allow all other commands:

```json
{
  "tools": {
    "core": ["run_shell_command"],
    "exclude": ["run_shell_command(rm)"]
  }
}
```

- `rm -rf /`: Blocked
- `git status`: Allowed
- `npm install`: Allowed

**Blocklist takes precedence**

If a command prefix is in both `tools.core` and `tools.exclude`, it will be
blocked.

- **`tools.shell.enableInteractiveShell`**: (boolean) Uses `node-pty` for
  real-time interaction.
- **`tools.shell.showColor`**: (boolean) Preserves ANSI colors in output.
- **`tools.shell.inactivityTimeout`**: (number) Seconds to wait for output
  before killing the process.

### Command restrictions

You can limit which commands the agent is allowed to request using these
settings:

- **`tools.core`**: An allowlist of command prefixes (for example,
  `["git", "npm test"]`).
- **`tools.exclude`**: A blocklist of command prefixes.

## Use cases

- Running build scripts and test suites.
- Initializing or managing version control systems.
- Installing project dependencies.
- Starting development servers or background watchers.

## Next steps

- Follow the [Shell commands tutorial](../cli/tutorials/shell-commands.md) for
  practical examples.
- Learn about [Sandboxing](../cli/sandbox.md) to isolate command execution.
