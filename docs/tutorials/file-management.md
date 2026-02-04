# File management with Gemini CLI

Gemini CLI lets you interact with your local files using natural language. You
can include file content in your prompts, ask the AI to analyze your codebase,
and request modifications to your source files.

## Include files in your prompt

The most direct way to give Gemini context is by using the `@` symbol followed
by a path to a file or directory.

- **Single file:** `@README.md What is the purpose of this project?`
- **Directory:** `@src/ Explain the architecture of this component.`
- **Multiple paths:** `@src/utils.ts @src/types.ts Refactor these to use...`

When you use `@`, Gemini CLI automatically reads the specified files and
includes their content in your request. It respects your `.gitignore` and
`.geminiignore` patterns by default.

## Ask Gemini to explore your files

You don't always need to use the `@` syntax. You can simply ask Gemini to find
or read information for you.

- "List all the TypeScript files in this project."
- "Find where the authentication logic is implemented."
- "Read the configuration file and tell me the current timeout value."

Gemini will use internal tools like `list_directory`, `glob`, and `read_file` to
fulfill these requests.

## Modify files

Gemini can also help you write and edit code. When you ask for a change, the CLI
will show you a diff of the proposed modifications.

- "Create a new file called `utils.ts` with a function to..."
- "Add a null check to the `render` function in `App.tsx`."
- "Refactor all occurrences of `var` to `const` in this directory."

> **Security Note:** Gemini CLI will always ask for your confirmation before
> writing to or modifying any files on your system unless you have explicitly
> enabled a privileged approval mode.

## Next steps

- Explore the technical [File system tools reference](../tools/file-system.md)
  for detailed tool parameters.
- Learn about [Ignoring files](../cli/gemini-ignore.md) to control what Gemini
  can see.
- See the [Command reference](../cli/commands.md) for related slash commands.
