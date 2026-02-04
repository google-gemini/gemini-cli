# Internal documentation tool (`get_internal_docs`)

The `get_internal_docs` tool allows the Gemini agent to access its own technical
documentation to provide more accurate answers about its capabilities and usage.

## Description

Use this tool when the agent needs to verify specific details about Gemini CLI's
internal features, built-in commands, or configuration options. It provides the
agent with direct access to the Markdown files in the `docs/` directory.

### Arguments

`get_internal_docs` takes one optional argument:

- `path` (string, optional): The relative path to a specific documentation file
  (for example, `cli/commands.md`). If omitted, the tool returns a list of all
  available documentation paths.

## Usage

The `get_internal_docs` tool is used exclusively by the Gemini agent. You cannot
invoke this tool manually.

When the agent uses this tool, it retrieves the content of the requested
documentation file and processes it to answer your question. This ensures that
the information provided by the AI is grounded in the latest project
documentation.

## Behavior

The agent uses this tool to ensure technical accuracy:

- **Capability discovery:** If the agent is unsure how a feature works, it can
  lookup the corresponding documentation.
- **Reference lookup:** The agent can verify slash command sub-commands or
  specific setting names.
- **Self-correction:** The agent can use the documentation to correct its
  understanding of Gemini CLI's system logic.

## Next steps

- Explore the [Command reference](../cli/commands.md) for a detailed guide to
  slash commands.
- See the [Configuration guide](../get-started/configuration.md) for settings
  reference.
