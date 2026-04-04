# Visualize diagrams

Gemini CLI can generate and render Mermaid diagrams directly in the terminal
with the `/visualize` slash command and the `visualize` tool.

This keeps architecture and flow discussions inside your CLI session without
switching to an external renderer.

## Slash command

Use `/visualize` with one of six subcommands:

- `flowchart`: Generate and render a Mermaid flowchart.
- `sequence`: Generate and render a Mermaid sequence diagram.
- `class`: Generate and render a Mermaid class diagram.
- `erd`: Generate and render a Mermaid entity-relationship diagram.
- `deps`: Auto-detect dependencies from common project manifests and visualize
  them.
- `git`: Visualize recent commit history from your repository.

### Examples

```text
/visualize flowchart request lifecycle with retries and timeout
/visualize sequence auth handshake between cli, proxy, and api
/visualize class model for user, organization, and billing plan
/visualize erd users, sessions, and checkpoints
/visualize deps
/visualize git
```

## Dependency visualization (`deps`)

The `deps` subcommand automatically checks for these files in your project root:

- `package.json`
- `requirements.txt`
- `Cargo.toml`
- `go.mod`
- `pom.xml`
- `pyproject.toml`

It parses dependency names and renders a flowchart-style dependency map.

## Git visualization (`git`)

The `git` subcommand reads recent commits from `git log` and renders commit
relationships as a flowchart.

## Renderer behavior

The built-in renderer supports these Mermaid diagram types:

- `flowchart`
- `sequenceDiagram`
- `classDiagram`
- `erDiagram`

Rendered output is optimized for terminal display and cached with an in-memory
LRU cache to speed up repeated renders.

## Related docs

- [Command reference](../reference/commands.md#visualize)
- [Tools reference](../reference/tools.md)
- [Visualize tool technical reference](../tools/visualize.md)
