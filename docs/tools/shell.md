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

You can customize the tool's behavior in your `settings.json` file.

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

- Follow the [Shell commands tutorial](../tutorials/shell-commands.md) for
  practical examples.
- Learn about [Sandboxing](../cli/sandbox.md) to isolate command execution.
