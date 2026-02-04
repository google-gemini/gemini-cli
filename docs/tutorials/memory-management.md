# Manage persistent context and memory

Gemini CLI provides two ways to maintain persistent context across your
sessions: `GEMINI.md` files for project-wide instructions and the `save_memory`
tool for individual facts.

## Project context with `GEMINI.md`

You can define persistent rules, personas, and coding standards for your
projects by creating `GEMINI.md` files. The CLI automatically loads these files
and includes them in every prompt.

- **Hierarchical loading:** Context is loaded from your global config, your
  project root, and your current subdirectory.
- **Example uses:** Define your preferred indentation, naming conventions, or
  architectural patterns.
- **Refresh context:** Use the `/memory refresh` command if you update your
  `GEMINI.md` files while a session is active.

## Individual facts with `save_memory`

If you want Gemini to remember a specific detail indefinitely, you can ask it to
"remember" or "save" information.

- "Remember that my preferred testing framework is Vitest."
- "Save the fact that this project uses a microservices architecture."

This information is stored in your global `GEMINI.md` file and will be available
in all future sessions.

## Inspecting your context

You can view the exact instructional context being provided to the model at any
time.

- **`/memory show`:** Displays the full, concatenated content of all loaded
  context files.
- **`/memory list`:** Lists the paths of the specific `GEMINI.md` files
  currently in use.

## Next steps

- Read the detailed guide on
  [Providing context with GEMINI.md](../cli/gemini-md.md).
- See the [Memory tool reference](../tools/memory.md) for technical details.
- Explore the [Command reference](../cli/commands.md) for more `/memory`
  sub-commands.
