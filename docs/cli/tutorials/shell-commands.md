# Execute shell commands

Use the CLI to run builds, manage git, and automate system tasks without leaving
the conversation. In this guide, you'll learn how to run commands directly,
automate complex workflows, and manage background processes safely.

## Prerequisites

- Gemini CLI installed and authenticated.
- Basic familiarity with your system's shell (Bash, Zsh, PowerShell, etc.).

## How to run commands directly (`!`)

Sometimes you just need to check a file size or git status without asking the AI
to do it for you. You can pass commands directly to your shell using the `!`
prefix.

**Example:** `!ls -la`

This executes `ls -la` immediately and prints the output to your terminal. The
AI doesn't "see" this output unless you paste it back into the chat or use it in
a prompt.

### Scenario: Entering Shell mode

If you're doing a lot of manual work, toggle "Shell Mode" by typing `!` and
pressing **Enter**. Now, everything you type is sent to the shell until you exit
(usually by pressing **Esc** or typing `exit`).

## How to automate complex tasks

You can automate tasks using a combination of Gemini CLI and shell commands.

### Scenario: Run tests and fix failures

You want to run tests and fix any failures.

**Prompt:**
`Run the unit tests. If any fail, analyze the error and try to fix the code.`

**Workflow:**

1.  Gemini calls `run_shell_command('npm test')`.
2.  You see a confirmation prompt: `Allow command 'npm test'? [y/N]`.
3.  You press `y`.
4.  The tests run. If they fail, Gemini reads the error output.
5.  Gemini uses `read_file` to inspect the failing test.
6.  Gemini uses `replace` to fix the bug.
7.  Gemini runs `npm test` again to verify the fix.

This loop turns Gemini into an autonomous engineer.

## How to manage background processes

You can ask Gemini to start long-running tasks, like development servers or file
watchers.

**Prompt:** `Start the React dev server in the background.`

Gemini will run the command (e.g., `npm run dev`) and detach it.

### Scenario: Viewing active shells

To see what's running in the background, use the `/shells` command.

**Command:** `/shells`

This opens a dashboard where you can view logs or kill runaway processes.

## How to handle interactive commands

Gemini CLI attempts to handle interactive commands (like `git add -p` or
confirmation prompts) by streaming the output to you. However, for highly
interactive tools (like `vim` or `top`), it's often better to run them yourself
in a separate terminal window or use the `!` prefix.

## Safety first

Giving an AI access to your shell is powerful but risky. Gemini CLI includes
several safety layers.

### Confirmation prompts

By default, **every** shell command requested by the agent requires your
explicit approval.

- **Allow once:** Runs the command one time.
- **Allow always:** Trusts this specific command for the rest of the session.
- **Deny:** Stops the agent.

### Sandboxing

For maximum security, especially when running untrusted code or exploring new
projects, we strongly recommend enabling Sandboxing. This runs all shell
commands inside a secure Docker container.

**Enable sandboxing:** Use the `--sandbox` flag when starting the CLI:
`gemini --sandbox`.

## Next steps

- Learn about [Sandboxing](../../cli/sandbox.md) to safely run destructive
  commands.
- See the [Shell tool reference](../../tools/shell.md) for configuration options
  like timeouts and working directories.
- Explore [Task planning](task-planning.md) to see how shell commands fit into
  larger workflows.
