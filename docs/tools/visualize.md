# Visualize tool (`visualize`)

The `visualize` tool renders Mermaid diagrams as terminal-friendly text output.

Gemini CLI uses this tool directly for `/visualize deps` and `/visualize git`,
and it can also be invoked by the model after `/visualize flowchart`,
`/visualize sequence`, `/visualize class`, and `/visualize erd` prompts.

## Technical reference

### Arguments

- `mermaid` (string, required): Full Mermaid source text.
- `diagramType` (string, optional): One of `flowchart`, `sequence`, `class`,
  `erd`. If omitted, the renderer detects type from the Mermaid header.
- `title` (string, optional): Title prepended to rendered output.

### Supported Mermaid headers

- `flowchart` (or `graph`)
- `sequenceDiagram`
- `classDiagram`
- `erDiagram`

## Technical behavior

- Uses an in-memory LRU cache (64 entries) keyed by diagram type and source.
- Returns rendered diagram text suitable for terminal display.
- Returns an execution error when source is empty or diagram type cannot be
  detected.

## Use cases

- Visualizing request and data flows.
- Quickly mapping entities and relationships.
- Reviewing dependency layout in polyglot repositories.
- Summarizing commit history shape in terminal sessions.

## Related docs

- [Visualize diagrams feature guide](../cli/visualize.md)
- [Tools reference](../reference/tools.md)
- [Command reference for `/visualize`](../reference/commands.md#visualize)
