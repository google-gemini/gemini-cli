# Custom Commands

Custom commands let you save and reuse your favorite or most frequently used
prompts as personal shortcuts within Gemini CLI. You can create commands that
are specific to a single project or commands that are available globally across
all your projects, streamlining your workflow and ensuring consistency.

## File locations and precedence

Gemini CLI discovers commands from two locations, loaded in a specific order:

1.  **User Commands (Global):** Located in `~/.gemini/commands/`. These commands
    are available in any project you are working on.
2.  **Project Commands (Local):** Located in
    `<your-project-root>/.gemini/commands/`. These commands are specific to the
    current project and can be checked into version control to be shared with
    your team.

If a command in the project directory has the same name as a command in the user
directory, the **project command will always be used.** This allows projects to
override global commands with project-specific versions.

## Naming and namespacing

The name of a command is determined by its file path relative to its `commands`
directory. Subdirectories are used to create namespaced commands, with the path
separator (`/` or `\`) being converted to a colon (`:`).

- A file at `~/.gemini/commands/test.toml` becomes the command `/test`.
- A file at `<project>/.gemini/commands/git/commit.toml` becomes the namespaced
  command `/git:commit`.

## TOML File Format (v1)

Your command definition files must be written in the TOML format and use the
`.toml` file extension.

### Required fields

- `prompt` (String): The prompt that will be sent to the Gemini model when the
  command is executed. This can be a single-line or multi-line string.

### Optional fields

- `description` (String): A brief, one-line description of what the command
  does. This text will be displayed next to your command in the `/help` menu.
  **If you omit this field, a generic description will be generated from the
  filename.**

## Handling arguments

Custom commands support two powerful methods for handling arguments. The CLI
automatically chooses the correct method based on the content of your command\'s
`prompt`.

### 1. Context-aware injection with `{{args}}`

If your `prompt` contains the special placeholder `{{args}}`, the CLI will
replace that placeholder with the text the user typed after the command name.

The behavior of this injection depends on where it is used:

**A. Raw injection (outside Shell commands)**

When used in the main body of the prompt, the arguments are injected exactly as
the user typed them.

**Example (`git/fix.toml`):**

```toml
# Invoked via: /git:fix "Button is misaligned"

description = "Generates a fix for a given issue."
prompt = "Please provide a code fix for the issue described here: {{args}}."
```

The model receives:
`Please provide a code fix for the issue described here: "Button is misaligned".`

**B. Using arguments in Shell commands (inside `!{...}` blocks)**

When you use `{{args}}` inside a shell injection block (`!{...}`), the arguments
are automatically **shell-escaped** before replacement. This allows you to
safely pass arguments to shell commands, ensuring the resulting command is
syntactically correct and secure while preventing command injection
vulnerabilities.

**Example (`/grep-code.toml`):**

```toml
prompt = """
Please summarize the findings for the pattern `{{args}}`.

Search Results:
!{grep -r {{args}} .}
"""
```

When you run `/grep-code It\'s complicated`:

1. The CLI sees `{{args}}` used both outside and inside `!{...}`.
2. Outside: The first `{{args}}` is replaced raw with `It\'s complicated`.
3. Inside: The second `{{args}}` is replaced with the escaped version (e.g., on
   Linux: `"It\'s complicated"`).
4. The command executed is `grep -r "It\'s complicated" .`.
5. The CLI prompts you to confirm this exact, secure command before execution.
6. The final prompt is sent.

### 2. Default argument handling

If your `prompt` does **not** contain the special placeholder `{{args}}`, the
CLI uses a default behavior for handling arguments.

If you provide arguments to the command (e.g., `/mycommand arg1`), the CLI will
append the full command you typed to the end of the prompt, separated by two
newlines. This allows the model to see both the original instructions and the
specific arguments you just provided.

If you do **not** provide any arguments (e.g., `/mycommand`), the prompt is sent
to the model exactly as it is, with nothing appended.

**Example (`changelog.toml`):**

This example shows how to create a robust command by defining a role for the
model, explaining where to find the user's input, and specifying the expected
format and behavior.

```toml
# In: <project>/.gemini/commands/changelog.toml
# Invoked via: /changelog 1.2.0 added "Support for default argument parsing."

description = "Adds a new entry to the project\'s CHANGELOG.md file."
prompt = """
# Task: Update Changelog

You are an expert maintainer of this software project. A user has invoked a command to add a new entry to the changelog.

**The user\'s raw command is appended below your instructions.**

Your task is to parse the `<version>`, `<change_type>`, and `<message>` from their input and use the `write_file` tool to correctly update the `CHANGELOG.md` file.

## Expected Format
The command follows this format: `/changelog <version> <type> <message>`
- `<type>` must be one of: "added", "changed", "fixed", "removed".

## Behavior
1. Read the `CHANGELOG.md` file.
2. Find the section for the specified `<version>`.
3. Add the `<message>` under the correct `<type>` heading.
4. If the version or type section doesn\'t exist, create it.
5. Adhere strictly to the "Keep a Changelog" format.
"""
```

When you run `/changelog 1.2.0 added "New feature"`, the final text sent to the
model will be the original prompt followed by two newlines and the command you
typed.

### 3. Executing Shell commands with `!{...}`

You can make your commands dynamic by executing shell commands directly within
your `prompt` and injecting their output. This is ideal for gathering context
from your local environment, like reading file content or checking the status of
Git.

When a custom command attempts to execute a shell command, Gemini CLI will now
prompt you for confirmation before proceeding. This is a security measure to
ensure that only intended commands can be run.

**How it works:**

1.  **Inject commands:** Use the `!{...}` syntax.
2.  **Argument substitution:** If `{{args}}` is present inside the block, it is
    automatically shell-escaped (see
    [Context-Aware Injection](#1-context-aware-injection-with-args) above).
3.  **Robust parsing:** The parser correctly handles complex shell commands that
    include nested braces, such as JSON payloads. **Note:** The content inside
    `!{...}` must have balanced braces (`{` and `}`). If you need to execute a
    command containing unbalanced braces, consider wrapping it in an external
    script file and calling the script within the `!{...}` block.
4.  **Security check and confirmation:** The CLI performs a security check on
    the final, resolved command (after arguments are escaped and substituted). A
    dialog will appear showing the exact command(s) to be executed.
5.  **Execution and error reporting:** The command is executed. If the command
    fails, the output injected into the prompt will include the error messages
    (stderr) followed by a status line, e.g.,
    `[Shell command exited with code 1]`. This helps the model understand the
    context of the failure.

**Example (`git/commit.toml`):**

This command gets the staged git diff and uses it to ask the model to write a
commit message.

````toml
# In: <project>/.gemini/commands/git/commit.toml
# Invoked via: /git:commit

description = "Generates a Git commit message based on staged changes."

# The prompt uses !{...} to execute the command and inject its output.
prompt = """
Please generate a Conventional Commit message based on the following git diff:

```diff
!{git diff --staged}
```

"""

````

When you run `/git:commit`, the CLI first executes `git diff --staged`, then
replaces `!{git diff --staged}` with the output of that command before sending
the final, complete prompt to the model.

### 4. Injecting file content with `@{...}`

You can directly embed the content of a file or a directory listing into your
prompt using the `@{...}` syntax. This is useful for creating commands that
operate on specific files.

**How it works:**

- **File injection**: `@{path/to/file.txt}` is replaced by the content of
  `file.txt`.
- **Multimodal support**: If the path points to a supported image (e.g., PNG,
  JPEG), PDF, audio, or video file, it will be correctly encoded and injected as
  multimodal input. Other binary files are handled gracefully and skipped.
- **Directory listing**: `@{path/to/dir}` is traversed and each file present
  within the directory and all subdirectories is inserted into the prompt. This
  respects `.gitignore` and `.geminiignore` if enabled.
- **Workspace-aware**: The command searches for the path in the current
  directory and any other workspace directories. Absolute paths are allowed if
  they are within the workspace.
- **Processing order**: File content injection with `@{...}` is processed
  _before_ shell commands (`!{...}`) and argument substitution (`{{args}}`).
- **Parsing**: The parser requires the content inside `@{...}` (the path) to
  have balanced braces (`{` and `}`).

**Example (`review.toml`):**

This command injects the content of a _fixed_ best practices file
(`docs/best-practices.md`) and uses the user\'s arguments to provide context for
the review.

```toml
# In: <project>/.gemini/commands/review.toml
# Invoked via: /review FileCommandLoader.ts

description = "Reviews the provided context using a best practice guide."
prompt = """
You are an expert code reviewer.

Your task is to review {{args}}.

Use the following best practices when providing your review:

@{docs/best-practices.md}
"""
```

When you run `/review FileCommandLoader.ts`, the `@{docs/best-practices.md}`
placeholder is replaced by the content of that file, and `{{args}}` is replaced
by the text you provided, before the final prompt is sent to the model.

---

## Example: A "Pure Function" refactoring command

Let's create a global command that asks the model to refactor a piece of code.

**1. Create the file and directories:**

First, ensure the user commands directory exists, then create a `refactor`
subdirectory for organization and the final TOML file.

```bash
mkdir -p ~/.gemini/commands/refactor
touch ~/.gemini/commands/refactor/pure.toml
```

**2. Add the content to the file:**

Open `~/.gemini/commands/refactor/pure.toml` in your editor and add the
following content. We are including the optional `description` for best
practice.

```toml
# In: ~/.gemini/commands/refactor/pure.toml
# This command will be invoked via: /refactor:pure

description = "Asks the model to refactor the current context into a pure function."

prompt = """
Please analyze the code I\'ve provided in the current context.
Refactor it into a pure function.

Your response should include:
1. The refactored, pure function code block.
2. A brief explanation of the key changes you made and why they contribute to purity.
"""
```

**3. Run the Command:**

That's it! You can now run your command in the CLI. First, you might add a file
to the context, and then invoke your command:

```
> @my-messy-function.js
> /refactor:pure
```

Gemini CLI will then execute the multi-line prompt defined in your TOML file.
