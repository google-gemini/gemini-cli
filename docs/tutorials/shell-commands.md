# Execute shell commands with Gemini CLI

Gemini CLI integrates directly with your system's shell, allowing you to run
commands, scripts, and automation tasks. You can trigger commands manually or
ask Gemini to perform operations for you.

## Direct shell execution

You can execute any shell command directly from the Gemini prompt using the `!`
prefix.

- **One-off command:** `!ls -la`
- **Git operations:** `!git status`
- **Shell mode:** Type `!` on its own to toggle "Shell Mode," where all input is
  treated as a shell command until you exit.

Commands execute using `bash` on macOS and Linux, or `powershell.exe` on
Windows.

## Ask Gemini to run commands

You can also ask Gemini to perform tasks that require shell access. Gemini will
request to use the `run_shell_command` tool.

- "Run the tests for this project."
- "Initialize a new Git repository."
- "Install the dependencies from `package.json`."

## Background processes

For long-running tasks like development servers or build watchers, you can ask
Gemini to run commands in the background.

- "Start the dev server in the background."
- "Run `npm run watch &`."

You can view and manage background processes by using the `/shells` command.

## Confirmation and safety

By default, Gemini CLI will prompt you for confirmation before executing any
shell command requested by the AI. You will see the exact command and can choose
to allow it once, allow it for the rest of the session, or deny it.

> **Security Note:** Use caution when allowing AI to execute arbitrary shell
> commands. Use [Sandboxing](../cli/sandbox.md) for an extra layer of
> protection.

## Next steps

- See the [Shell tool reference](../tools/shell.md) for technical parameters and
  configuration options.
- Learn how to [Sandbox tool execution](../cli/sandbox.md) for enhanced
  security.
- Explore [Trusted folders](../cli/trusted-folders.md) to manage command
  permissions.
