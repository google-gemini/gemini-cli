# Sub-agents (experimental)

Sub-agents are specialized agents that operate within your main Gemini CLI
session. They are designed to handle specific, complex tasks—like deep codebase
analysis, documentation lookup, or domain-specific reasoning—without cluttering
the main agent's context or toolset.

> **Note: Sub-agents are currently an experimental feature.**
>
> To use custom sub-agents, you must explicitly enable them in your
> `settings.json`:
>
> ```json
> {
>   "experimental": { "enableAgents": true }
> }
> ```
>
> **Warning:** Sub-agents currently operate in
> ["YOLO mode"](../get-started/configuration.md#command-line-arguments), meaning
> they may execute tools without individual user confirmation for each step.
> Proceed with caution when defining agents with powerful tools like
> `run_shell_command` or `write_file`.

## What are Sub-Agents?

Think of sub-agents as "specialists" that the main Gemini agent can hire for a
specific job.

- **Focused Context:** Each sub-agent has its own system prompt and persona.
- **Specialized Tools:** Sub-agents can have a restricted or specialized set of
  tools.
- **Independent Context Window:** Interactions with a sub-agent happen in a
  separate context loop. The main agent only sees the final result, saving
  tokens in your main conversation history.

The main agent uses the `delegate_to_agent` tool to hand off a task to a
sub-agent. Once the sub-agent completes its task (or fails), it reports back to
the main agent with its findings.

## Built-in Sub-Agents

Gemini CLI comes with powerful built-in sub-agents.

### Codebase Investigator

- **Name:** `codebase_investigator`
- **Purpose:** Deep analysis of the codebase, reverse engineering, and
  understanding complex dependencies.
- **When to use:** "How does the authentication system work?", "Map out the
  dependencies of the `AgentRegistry` class."
- **Configuration:** Enabled by default. You can configure it in
  `settings.json`:
  ```json
  {
    "experimental": {
      "codebaseInvestigatorSettings": {
        "enabled": true,
        "maxNumTurns": 20,
        "model": "gemini-2.0-flash-thinking-exp"
      }
    }
  }
  ```

### CLI Help Agent

- **Name:** `cli_help`
- **Purpose:** Expert knowledge about Gemini CLI itself, its commands,
  configuration, and documentation.
- **When to use:** "How do I configure a proxy?", "What does the /rewind command
  do?"
- **Configuration:** Enabled by default.

## Creating Custom Sub-Agents

You can create your own sub-agents to automate specific workflows or enforce
specific personas.

### Prerequisites

To use custom sub-agents, you must enable them in your `settings.json`:

```json
{
  "experimental": {
    "enableAgents": true
  }
}
```

### Agent Definition Files

Custom agents are defined as Markdown files (`.md`) with YAML frontmatter. You
can place them in:

1.  **Project-level:** `.gemini/agents/*.md` (Shared with your team)
2.  **User-level:** `~/.gemini/agents/*.md` (Personal agents)

### File Format

The file **MUST** start with YAML frontmatter enclosed in triple-dashes `---`.
The body of the markdown file becomes the agent's **System Prompt**.

**Example: `.gemini/agents/security-auditor.md`**

```markdown
---
name: security-auditor
description: Specialized in finding security vulnerabilities in code.
kind: local
tools:
  - read_file
  - search_file_content
model: gemini-2.0-flash-thinking-exp
temperature: 0.2
max_turns: 10
---

You are a ruthless Security Auditor. Your job is to analyze code for potential
vulnerabilities.

Focus on:

1. SQL Injection
2. XSS (Cross-Site Scripting)
3. Hardcoded credentials
4. Unsafe file operations

When you find a vulnerability, explain it clearly and suggest a fix. Do not fix
it yourself; just report it.
```

### Configuration Schema

| Field          | Type   | Required | Description                                                                                                                |
| :------------- | :----- | :------- | :------------------------------------------------------------------------------------------------------------------------- |
| `name`         | string | Yes      | Unique identifier (slug) used by `delegate_to_agent`. Only lowercase letters, numbers, hyphens, and underscores.           |
| `description`  | string | Yes      | Short description of what the agent does. This is visible to the main agent to help it decide when to call this sub-agent. |
| `kind`         | string | No       | `local` (default) or `remote`.                                                                                             |
| `tools`        | array  | No       | List of tool names this agent can use. If omitted, it may have access to a default set.                                    |
| `model`        | string | No       | Specific model to use (e.g., `gemini-1.5-pro`). Defaults to `inherit` (uses the main session model).                       |
| `temperature`  | number | No       | Model temperature (0.0 - 2.0).                                                                                             |
| `max_turns`    | number | No       | Maximum number of conversation turns allowed for this agent before it must return.                                         |
| `timeout_mins` | number | No       | Maximum execution time in minutes.                                                                                         |

## Remote Agents (Agent2Agent)

Gemini CLI can also delegate tasks to remote agents via the Model Context
Protocol (MCP) or compatible Agent2Agent interfaces.

To define a remote agent, use `kind: remote` and provide the `agent_card_url`.

```markdown
---
name: bigquery-analyst
description: Can query BigQuery datasets and visualize results.
kind: remote
agent_card_url: https://agent.example.com/cards/bigquery-analyst
---
```

## Extension Sub-Agents

Extensions can bundle and distribute sub-agents. See the
[Extensions documentation](../extensions/index.md#sub-agents) for details on how
to package agents within an extension.
