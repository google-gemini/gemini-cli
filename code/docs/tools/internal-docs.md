# Internal documentation tool (`get_internal_docs`)

The `get_internal_docs` tool lets Gemini CLI access its own technical
documentation to provide more accurate answers about its capabilities and usage.

## Description

This tool is used when Gemini CLI needs to verify specific details about Gemini
CLI's internal features, built-in commands, or configuration options. It
provides direct access to the Markdown files in the `docs/` directory.

### Arguments

`get_internal_docs` takes one optional argument:

- `path` (string, optional): The relative path to a specific documentation file
  (for example, `reference/commands.md`). If omitted, the tool returns a list of
  all available documentation paths.

## Usage

The `get_internal_docs` tool is used exclusively by Gemini CLI. You cannot
invoke this tool manually.

When Gemini CLI uses this tool, it retrieves the content of the requested
documentation file and processes it to answer your question. This ensures that
the information provided by the AI is grounded in the latest project
documentation.

## Behavior

Gemini CLI uses this tool to ensure technical accuracy:

- **Capability discovery:** If Gemini CLI is unsure how a feature works, it can
  lookup the corresponding documentation.
- **Reference lookup:** Gemini CLI can verify slash command sub-commands or
  specific setting names.
- **Self-correction:** Gemini CLI can use the documentation to correct its
  understanding of Gemini CLI's system logic.

## Next steps

- Explore the [Command reference](../reference/commands.md) for a detailed guide
  to slash commands.
- See the [Configuration guide](../reference/configuration.md) for settings
  reference.
