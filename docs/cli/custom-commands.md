# Creating Custom Commands

Custom commands let you save and reuse your favorite or most frequently used prompts as personal shortcuts. You can create commands that are specific to a single project or commands that are available globally across all your projects.

## How custom commands work

You define custom commands in `.toml` files, which the Gemini CLI discovers from two locations in a specific order of precedence:

1.  **User commands (global):** Place these in `~/.gemini/commands/`. You can use these commands in any project.
2.  **Project commands (local):** Place these in `<your-project-root>/.gemini/commands/`. You can check these commands into your version control to share them with your team.

If a command in the project directory has the same name as a command in the user directory, the CLI always uses the project command. This lets you override global commands with project-specific versions.

### Naming and namespacing

The CLI determines a command's name from its file path relative to the `commands` directory. To create namespaced commands, you can use subdirectories. The CLI converts the path separator (`/` or `\`) to a colon (`:`).

- A file at `~/.gemini/commands/test.toml` becomes the command `/test`.
- A file at `<project>/.gemini/commands/git/commit.toml` becomes the namespaced command `/git:commit`.

## Defining a command in TOML

You must write your command definition files in the TOML format with a `.toml` file extension.

- `prompt` (String, Required): The prompt that the CLI sends to the model when you execute the command.
- `description` (String, Optional): A brief, one-line description of what the command does. This text appears next to your command in the `/help` menu.

**Example `review.toml`:**
```toml
description = "Provides a basic code review on the provided context."
prompt = "Please provide a code review for the code I have provided in the context."
```

## Making prompts dynamic

You can make your commands more powerful by making the prompts dynamic. You can do this by accepting user arguments or by injecting content from files or shell commands.

### Using user arguments with `{{args}}`

If your `prompt` contains the `{{args}}` placeholder, the CLI replaces that placeholder with the text you type after the command name. This lets you create flexible commands that operate on your input.

**Example (`review.toml`):**
```toml
description = "Reviews the specified file."
prompt = "Please provide a code review for the following file: {{args}}"
```
**To use this command, run:**
```
> /review src/components/Button.tsx
```
The model receives the prompt: `Please provide a code review for the following file: src/components/Button.tsx`.

### Injecting shell command output with `!{...}`

You can execute a shell command and inject its standard output directly into your prompt by using the `!{...}` syntax. This is ideal for gathering local context, such as the status of a git repository or the output of a test script.

For security, the CLI shows you the exact command it is about to run and asks for your confirmation before proceeding.

**Example (`review.toml` evolution):**
```toml
description = "Reviews a file, including linting results."
prompt = """
Please provide a code review for the file `{{args}}`.

Also, consider the following linting report in your review:

**Linter Output:**
```
!{eslint {{args}}}
```
"""
```
When you run `/review src/main.js`, the CLI first executes `eslint src/main.js` and injects its output into the prompt.

### Injecting file content with `@{...}`

You can embed the content of a file directly into your prompt by using the `@{...}` syntax. This is useful for creating commands that analyze or operate on specific files. The command is workspace-aware and supports multimodal content like images and PDFs.

**Example (`review.toml` final evolution):**
```toml
description = "Reviews a file against the project's coding standards."
prompt = """
Please provide a code review for the file `{{args}}`.

Ensure your review checks for adherence to our official coding standards, included below.

---
**Coding Standards:**
@{docs/coding-standards.md}
---
"""
```
**To use this command, run:**
```
> /review @src/utils.ts
```
This command injects the project's coding standards and the content of `src/utils.ts` into the prompt.