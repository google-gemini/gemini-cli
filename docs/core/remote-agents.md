# Remote Subagents (experimental)

Gemini CLI supports connecting to remote subagents using the Agent-to-Agent
(A2A) protocol. This allows Gemini CLI to interact with other agents, expanding
its capabilities by delegating tasks to remote services.

Gemini CLI can connect to any compliant A2A agent. You can find samples of A2A
agents in the following repositories:

- [ADK Samples (Python)](https://github.com/google/adk-samples/tree/main/python)
- [ADK Python Contributing Samples](https://github.com/google/adk-python/tree/main/contributing/samples)

> **Note: Remote subagents are currently an experimental feature.**

## Configuration

To use remote subagents, you must explicitly enable them in your
`settings.json`:

```json
{
  "experimental": {
    "enableAgents": true
  }
}
```

## Defining remote subagents

Remote subagents are defined as Markdown files (`.md`) with YAML frontmatter.
You can place them in:

1.  **Project-level:** `.gemini/agents/*.md` (Shared with your team)
2.  **User-level:** `~/.gemini/agents/*.md` (Personal agents)

### Configuration schema

| Field            | Type   | Required | Description                                                                                                    |
| :--------------- | :----- | :------- | :------------------------------------------------------------------------------------------------------------- |
| `kind`           | string | Yes      | Must be `remote`.                                                                                              |
| `name`           | string | Yes      | A unique name for the agent. Must be a valid slug (lowercase letters, numbers, hyphens, and underscores only). |
| `agent_card_url` | string | Yes      | The URL to the agent's A2A card endpoint.                                                                      |

### Single-subagent example

```markdown
---
kind: remote
name: my-remote-agent
agent_card_url: https://example.com/agent-card
---
```

### Multi-subagent example

The loader explicitly supports multiple remote subagents defined in a single
Markdown file.

```markdown
---
- kind: remote
  name: remote-1
  agent_card_url: https://example.com/1
- kind: remote
  name: remote-2
  agent_card_url: https://example.com/2
---
```

> **Note:** Mixed local and remote agents, or multiple local agents, are not
> supported in a single file; the list format is currently remote-only.

## Managing Subagents

Users can manage subagents using the following commands within the Gemini CLI:

- `/agents list`: Displays all available local and remote subagents.
- `/agents refresh`: Reloads the agent registry. Use this after adding or
  modifying agent definition files.
- `/agents enable <agent_name>`: Enables a specific subagent.
- `/agents disable <agent_name>`: Disables a specific subagent.

> **Tip:** You can use the `@cli_help` agent within Gemini CLI for assistance
> with configuring subagents.
