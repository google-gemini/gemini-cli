# Memory tool (`save_memory`)

The `save_memory` tool allows the Gemini agent to persist specific facts, user
preferences, and project details across sessions.

## Technical reference

This tool appends information to the `## Gemini Added Memories` section of your
global `GEMINI.md` file (typically located at `~/.gemini/GEMINI.md`).

### Arguments

- `fact` (string, required): A clear, self-contained statement in natural
  language.

## Technical behavior

- **Storage:** Appends to the global context file in the user's home directory.
- **Loading:** The stored facts are automatically included in the hierarchical
  context system for all future sessions.
- **Format:** Saves data as a bulleted list item within a dedicated Markdown
  section.

## Use cases

- Persisting user preferences (for example, "I prefer functional programming").
- Saving project-wide architectural decisions.
- Storing frequently used aliases or system configurations.

## Next steps

- Follow the [Memory management guide](../cli/tutorials/memory-management.md)
  for practical examples.
- Learn how the [Project context (GEMINI.md)](../cli/gemini-md.md) system loads
  this information.
