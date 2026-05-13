# Memory files

Gemini CLI persists durable facts, user preferences, and project details by
editing Markdown memory files directly.

## Technical reference

The agent routes memories to the appropriate Markdown file: shared project
instructions go in repository `GEMINI.md` files, private project notes go in the
per-project private memory folder, and cross-project personal preferences go in
the global `~/.gemini/GEMINI.md` file.

## Technical behavior

- **Storage:** Edits Markdown files with `write_file` or `replace`.
- **Loading:** The stored facts are automatically included in the hierarchical
  context system for all future sessions.
- **Format:** Keeps durable instructions concise and avoids duplicating the same
  fact across multiple memory tiers.

## Use cases

- Persisting user preferences (for example, "I prefer functional programming").
- Saving project-wide architectural decisions.
- Storing frequently used aliases or system configurations.

## Next steps

- Follow the [Memory management guide](../cli/tutorials/memory-management.md)
  for practical examples.
- Learn how the [Project context (GEMINI.md)](../cli/gemini-md.md) system loads
  this information.
