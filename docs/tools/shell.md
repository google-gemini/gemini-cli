# Shell Tool (`run_shell_command`)

This document describes the `run_shell_command` tool for the Gemini CLI.

## Description

Use `run_shell_command` to interact with the underlying system, run scripts, or perform command-line operations. `run_shell_command` executes a given shell command, including interactive commands that require user input (e.g., `vim`, `git rebase -i`) if the `tools.shell.enableInteractiveShell` setting is set to `true`.

On Windows, commands are executed with `cmd.exe /c`. On other platforms, they are executed with `bash -c`.

### Arguments

`run_shell_command` takes the following arguments:

- `command` (string, required): The exact shell command to execute.
- `description` (string, optional): A brief description of the command's purpose, which will be shown to the user.
- `directory` (string, optional): The directory (relative to the project root) in which to execute the command. If not provided, the command runs in the project root.

## How to use `run_shell_command` with the Gemini CLI

When using `run_shell_command`, the command is executed as a subprocess. `run_shell_command` can start background processes using `&`. The tool returns detailed information about the execution, including:

- `Command`: The command that was executed.
- `Directory`: The directory where the command was run.
- `Stdout`: Output from the standard output stream.
- `Stderr`: Output from the standard error stream.
- `Error`: Any error message reported by the subprocess.
- `Exit Code`: The exit code of the command.
- `Signal`: The signal number if the command was terminated by a signal.
- `Background PIDs`: A list of PIDs for any background processes started.

Usage:

```
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.")
```

## `run_shell_command` examples

List files in the current directory:

```
run_shell_command(command="ls -la")
```

Run a script in a specific directory:

```
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script")
```

Start a background server:

```
run_shell_command(command="npm run dev &", description="Start development server in background")
```

## Configuration

You can configure the behavior of the `run_shell_command` tool by modifying your `settings.json` file or by using the `/settings` command in the Gemini CLI.

### Enabling Interactive Commands

To enable interactive commands, you need to set the `tools.shell.enableInteractiveShell` setting to `true`. This will use `node-pty` for shell command execution, which allows for interactive sessions. If `node-pty` is not available, it will fall back to the `child_process` implementation, which does not support interactive commands.

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

### Showing Color in Output

To show color in the shell output, you need to set the `tools.shell.showColor` setting to `true`. **Note: This setting only applies when `tools.shell.enableInteractiveShell` is enabled.**

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

### Setting the Pager

You can set a custom pager for the shell output by setting the `tools.shell.pager` setting. The default pager is `cat`. **Note: This setting only applies when `tools.shell.enableInteractiveShell` is enabled.**

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

## Interactive Commands

The `run_shell_command` tool now supports interactive commands by integrating a pseudo-terminal (pty). This allows you to run commands that require real-time user input, such as text editors (`vim`, `nano`), terminal-based UIs (`htop`), and interactive version control operations (`git rebase -i`).

When an interactive command is running, you can send input to it from the Gemini CLI. To focus on the interactive shell, press `ctrl+f`. The terminal output, including complex TUIs, will be rendered correctly.

## Important notes

- **Security:** Be cautious when executing commands, especially those constructed from user input, to prevent security vulnerabilities.
- **Error handling:** Check the `Stderr`, `Error`, and `Exit Code` fields to determine if a command executed successfully.
- **Background processes:** When a command is run in the background with `&`, the tool will return immediately and the process will continue to run in the background. The `Background PIDs` field will contain the process ID of the background process.

## Environment Variables

When `run_shell_command` executes a command, it sets the `GEMINI_CLI=1` environment variable in the subprocess's environment. This allows scripts or tools to detect if they are being run from within the Gemini CLI.

## Command Restrictions

You can restrict the commands that can be executed by the `run_shell_command` tool by using the `tools.core` and `tools.exclude` settings in your configuration file.

- `tools.core`: To restrict `run_shell_command` to a specific set of commands, add entries to the `core` list under the `tools` category in the format `run_shell_command(<command>)`. For example, `"tools": {"core": ["run_shell_command(git)"]}` will only allow `git` commands. Including the generic `run_shell_command` acts as a wildcard, allowing any command not explicitly blocked.
- `tools.exclude`: To block specific commands, add entries to the `exclude` list under the `tools` category in the format `run_shell_command(<command>)`. For example, `"tools": {"exclude": ["run_shell_command(rm)"]}` will block `rm` commands.

The validation logic is designed to be secure and flexible:

1.  **Command Chaining Disabled**: The tool automatically splits commands chained with `&&`, `||`, or `;` and validates each part separately. If any part of the chain is disallowed, the entire command is blocked.
2.  **Prefix Matching**: The tool uses prefix matching. For example, if you allow `git`, you can run `git status` or `git log`.
3.  **Blocklist Precedence**: The `tools.exclude` list is always checked first. If a command matches a blocked prefix, it will be denied, even if it also matches an allowed prefix in `tools.core`.

### Command Restriction Examples

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

If a command prefix is in both `tools.core` and `tools.exclude`, it will be blocked.

```json
{
  "tools": {
    "core": ["run_shell_command(git)"],
    "exclude": ["run_shell_command(git push)"]
  }
}
```

- `git push origin main`: Blocked
- `git status`: Allowed

**Block all shell commands**

To block all shell commands, add the `run_shell_command` wildcard to `tools.exclude`:

```json
{
  "tools": {
    "exclude": ["run_shell_command"]
  }
}
```

- `ls -l`: Blocked
- `any other command`: Blocked

## Security Note for `excludeTools`

Command-specific restrictions in `excludeTools` for `run_shell_command` are based on simple string matching and can be easily bypassed. This feature is **not a security mechanism** and should not be relied upon to safely execute untrusted code. It is recommended to use `coreTools` to explicitly select commands
that can be executed.
