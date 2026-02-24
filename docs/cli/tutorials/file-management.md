# File management with Gemini CLI

Explore, analyze, and modify your codebase using Gemini CLI. In this guide,
you'll learn how to provide Gemini CLI with files and directories, modify and
create files, and control what Gemini CLI can see.

## Prerequisites

- Gemini CLI installed and authenticated.
- A project directory to work with (e.g., a git repository).

## How to give the agent context (Reading files)

Gemini CLI will generally try to read relevant files, sometimes prompting you
for access (depending on your settings). To ensure that Gemini CLI uses a file,
you can also include it directly.

### Direct file inclusion (`@`)

If you know the path to the file you want to work on, use the `@` symbol. This
forces the CLI to read the file immediately and inject its content into your
prompt.

```bash
`@src/components/UserProfile.tsx Explain how this component handles user data.`
```

### Working with multiple files

Complex features often span multiple files. You can chain `@` references to give
the agent a complete picture of the dependencies.

```bash
`@src/components/UserProfile.tsx @src/types/User.ts Refactor the component to use the updated User interface.`
```

### Including entire directories

For broad questions or refactoring, you can include an entire directory. Be
careful with large folders, as this consumes more tokens.

```bash
`@src/utils/ Check these utility functions for any deprecated API usage.`
```

## How to find files (Exploration)

If you _don't_ know the exact file path, you can ask Gemini CLI to find it for
you. This is useful when navigating a new codebase or looking for specific
logic.

### Scenario: Find a component definition

You know there's a `UserProfile` component, but you don't know where it lives.

```none
`Find the file that defines the UserProfile component.`
```

Gemini uses the `glob` or `list_directory` tools to search your project
structure. It will return the specific path (e.g.,
`src/components/UserProfile.tsx`), which you can then use with `@` in your next
turn.

> **Tip:** You can also ask for lists of files, like "Show me all the TypeScript
> configuration files in the root directory."

## How to modify code

Once Gemini CLI has context, you can direct it to make specific edits. The agent
is capable of complex refactoring, not just simple text replacement.

```none
`Update @src/components/UserProfile.tsx to show a loading spinner if the user data is null.`
```

Gemini CLI uses the `replace` tool to propose a targeted code change.

### Creating new files

You can also ask the agent to create entirely new files or folder structures.

```none
`Create a new file @src/components/LoadingSpinner.tsx with a simple Tailwind CSS spinner.`
```

Gemini CLI uses the `write_file` tool to generate the new file from scratch.

## Review and confirm changes

Gemini CLI prioritizes safety. Before any file is modified, it presents a
unified diff of the proposed changes.

```diff
- if (!user) return null;
+ if (!user) return <LoadingSpinner />;
```

- **Red lines (-):** Code that will be removed.
- **Green lines (+):** Code that will be added.

Press **y** to confirm and apply the change to your local file system. If the
diff doesn't look right, press **n** to cancel and refine your prompt.

## Verify the result

After the edit is complete, verify the fix. You can simply read the file again
or, better yet, run your project's tests.

```none
`Run the tests for the UserProfile component.`
```

Gemini CLI uses the `run_shell_command` tool to execute your test runner (e.g.,
`npm test` or `jest`). This ensures the changes didn't break existing
functionality.

## Advanced: Controlling what Gemini sees

By default, Gemini CLI respects your `.gitignore` file. It won't read or search
through `node_modules`, build artifacts, or other ignored paths.

If you have sensitive files (like `.env`) or large assets that you want to keep
hidden from the AI _without_ ignoring them in Git, you can create a
`.geminiignore` file in your project root.

**Example `.geminiignore`:**

```text
.env
local-db-dump.sql
private-notes.md
```

## Next steps

- Learn how to [Manage context and memory](memory-management.md) to keep your
  agent smarter over long sessions.
- See [Execute shell commands](shell-commands.md) for more on running tests and
  builds.
- Explore the technical [File system reference](../../tools/file-system.md) for
  advanced tool parameters.
