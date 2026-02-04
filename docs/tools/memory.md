# Memory tool (`save_memory`)

The `save_memory` tool lets you save and recall information across Gemini CLI
sessions. Use this tool to provide the agent with key details that persist,
allowing for personalized and directed assistance.

## Description

Use `save_memory` to direct the CLI to remember user preferences, project
details, or any other information that you want the model to keep in mind
indefinitely.

### Arguments

`save_memory` takes one argument:

- `fact` (string, required): The specific fact or piece of information to
  remember. This should be a clear, self-contained statement written in natural
  language.

## How to use `save_memory` with the Gemini CLI

The tool appends the provided `fact` to a special `GEMINI.md` file located in

your user home directory (`~/.gemini/GEMINI.md`) by default. This file can be

configured to have a different name in your settings.

Once added, the facts are stored under a `## Gemini Added Memories` section.

This file is loaded as context in subsequent sessions, allowing the CLI to

recall the saved information.

Usage:

```
save_memory(fact="Your fact here.")
```

### `save_memory` examples

Remember a user preference:

```
save_memory(fact="My preferred programming language is Python.")
```

Store a project-specific detail:

```
save_memory(fact="The project I'm currently working on is called 'gemini-cli'.")
```

## Important notes

When using the memory tool, keep the following considerations in mind to ensure
your persistent context remains useful and manageable.

- **General usage:** Use this tool for concise, important facts. It is not
  intended for storing large amounts of data or conversational history.
- **Memory file:** The memory file is a plain text Markdown file, so you can
  view and edit it manually if needed.

## Next steps

- Read about [Project context](../cli/gemini-md.md) to understand how
  `save_memory` integrates with the hierarchical context system.
- Explore [Session management](../cli/session-management.md) for short-term
  history.
