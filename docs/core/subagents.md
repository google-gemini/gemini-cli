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

## What are sub-agents?

Sub-agents are "specialists" that the main Gemini agent can hire for a specific
job.

- **Focused context:** Each sub-agent has its own system prompt and persona.
- **Specialized tools:** Sub-agents can have a restricted or specialized set of
  tools.
- **Independent context window:** Interactions with a sub-agent happen in a
  separate context loop, which saves tokens in your main conversation history.

Sub-agents are exposed to the main agent as a tool of the same name. When the
main agent calls the tool, it delegates the task to the sub-agent. Once the
sub-agent completes its task, it reports back to the main agent with its
findings.

## Built-in sub-agents

Gemini CLI comes with the following built-in sub-agents:

### Codebase Investigator

- **Name:** `codebase_investigator`
- **Purpose:** Analyze the codebase, reverse engineer, and understand complex
  dependencies.
- **When to use:** "How does the authentication system work?", "Map out the
  dependencies of the `AgentRegistry` class."
- **Configuration:** Enabled by default. You can configure it in
  `settings.json`. Example (forcing a specific model):
  ```json
  {
    "experimental": {
      "codebaseInvestigatorSettings": {
        "enabled": true,
        "maxNumTurns": 20,
        "model": "gemini-2.5-pro"
      }
    }
  }
  ```

### CLI Help Agent

- **Name:** `cli_help`
- **Purpose:** Get expert knowledge about Gemini CLI itself, its commands,
  configuration, and documentation.
- **When to use:** "How do I configure a proxy?", "What does the `/rewind`
  command do?"
- **Configuration:** Enabled by default.

### Generalist Agent

- **Name:** `generalist_agent`
- **Purpose:** Route tasks to the appropriate specialized sub-agent.
- **When to use:** Implicitly used by the main agent for routing. Not directly
  invoked by the user.
- **Configuration:** Enabled by default. No specific configuration options.

## Creating custom sub-agents

You can create your own sub-agents to automate specific workflows or enforce
specific personas. To use custom sub-agents, you must enable them in your
`settings.json`:

```json
{
  "experimental": {
    "enableAgents": true
  }
}
```

### Agent definition files

Custom agents are defined as Markdown files (`.md`) with YAML frontmatter. You
can place them in:

1.  **Project-level:** `.gemini/agents/*.md` (Shared with your team)
2.  **User-level:** `~/.gemini/agents/*.md` (Personal agents)

### File format

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
  - grep_search
model: gemini-2.5-pro
temperature: 0.2
max_turns: 10
---

You are a ruthless Security Auditor. Your job is to analyze code for potential
vulnerabilities.

Focus on:

1.  SQL Injection
2.  XSS (Cross-Site Scripting)
3.  Hardcoded credentials
4.  Unsafe file operations

When you find a vulnerability, explain it clearly and suggest a fix. Do not fix
it yourself; just report it.
```

### Configuration schema

| Field          | Type   | Required | Description                                                                                                                |
| :------------- | :----- | :------- | :------------------------------------------------------------------------------------------------------------------------- |
| `name`         | string | Yes      | Unique identifier (slug) used as the tool name for the agent. Only lowercase letters, numbers, hyphens, and underscores.   |
| `description`  | string | Yes      | Short description of what the agent does. This is visible to the main agent to help it decide when to call this sub-agent. |
| `kind`         | string | No       | `local` (default) or `remote`.                                                                                             |
| `tools`        | array  | No       | List of tool names this agent can use. If omitted, it may have access to a default set.                                    |
| `model`        | string | No       | Specific model to use (e.g., `gemini-2.5-pro`). Defaults to `inherit` (uses the main session model).                       |
| `temperature`  | number | No       | Model temperature (0.0 - 2.0).                                                                                             |
| `max_turns`    | number | No       | Maximum number of conversation turns allowed for this agent before it must return. Defaults to `15`.                       |
| `timeout_mins` | number | No       | Maximum execution time in minutes. Defaults to `5`.                                                                        |

### Optimizing your sub-agent

The main agent's system prompt encourages it to use an expert sub-agent when one
is available. It decides whether an agent is a relevant expert based on the
agent's description. You can improve the reliability with which an agent is used
by updating the description to more clearly indicate:

- Its area of expertise.
- When it should be used.
- Some example scenarios.

For example, the following sub-agent description should be called fairly
consistently for Git operations.

> Git expert agent which should be used for all local and remote git operations.
> For example:
>
> - Making commits
> - Searching for regressions with bisect
> - Interacting with source control and issues providers such as GitHub.

If you need to further tune your sub-agent, you can do so by selecting the model
to optimize for with `/model` and then asking the model why it does not think
that your sub-agent was called with a specific prompt and the given description.

## Remote subagents (Agent2Agent) (experimental)

Gemini CLI can also delegate tasks to remote sub-agents using the Agent-to-Agent
(A2A) protocol.

> **Note: Remote subagents are currently an experimental feature.**

See the [Remote Subagents documentation](/docs/core/remote-agents) for detailed
configuration and usage instructions.

## Extension sub-agents

Extensions can bundle and distribute sub-agents. See the
[Extensions documentation](../extensions/index.md#sub-agents) for details on how
to package agents within an extension.
