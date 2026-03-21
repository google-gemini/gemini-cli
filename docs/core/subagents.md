# Subagents (experimental)

Subagents are specialized agents that operate within your main Gemini CLI
session. They are designed to handle specific, complex tasks—like deep codebase
analysis, documentation lookup, or domain-specific reasoning—without cluttering
the main agent's context or toolset.

<!-- prettier-ignore -->
> [!NOTE]
> Subagents are currently an experimental feature.
> 
To use custom subagents, you must ensure they are enabled in your
`settings.json` (enabled by default):

```json
{
  "experimental": { "enableAgents": true }
}
```

## What are subagents?

Subagents are "specialists" that the main Gemini agent can hire for a specific
job.

- **Focused context:** Each subagent has its own system prompt and persona.
- **Specialized tools:** Subagents can have a restricted or specialized set of
  tools.
- **Independent context window:** Interactions with a subagent happen in a
  separate context loop, which saves tokens in your main conversation history.

Subagents are exposed to the main agent as a tool of the same name. When the
main agent calls the tool, it delegates the task to the subagent. Once the
subagent completes its task, it reports back to the main agent with its
findings.

## How to use subagents

You can use subagents through automatic delegation or by explicitly forcing them
in your prompt.

### Automatic delegation

Gemini CLI's main agent is instructed to use specialized subagents when a task
matches their expertise. For example, if you ask "How does the auth system
work?", the main agent may decide to call the `codebase_investigator` subagent
to perform the research.

### Forcing a subagent (@ syntax)

You can explicitly direct a task to a specific subagent by using the `@` symbol
followed by the subagent's name at the beginning of your prompt. This is useful
when you want to bypass the main agent's decision-making and go straight to a
specialist.

**Example:**

```bash
@codebase_investigator Map out the relationship between the AgentRegistry and the LocalAgentExecutor.
```

When you use the `@` syntax, the CLI injects a system note that nudges the
primary model to use that specific subagent tool immediately.

## Built-in subagents

Gemini CLI comes with the following built-in subagents:

### Codebase Investigator

- **Name:** `codebase_investigator`
- **Purpose:** Analyze the codebase, reverse engineer, and understand complex
  dependencies.
- **When to use:** "How does the authentication system work?", "Map out the
  dependencies of the `AgentRegistry` class."
- **Configuration:** Enabled by default. You can override its settings in
  `settings.json` under `agents.overrides`. Example (forcing a specific model
  and increasing turns):
  ```json
  {
    "agents": {
      "overrides": {
        "codebase_investigator": {
          "modelConfig": { "model": "gemini-3-flash-preview" },
          "runConfig": { "maxTurns": 50 }
        }
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
- **Purpose:** Route tasks to the appropriate specialized subagent.
- **When to use:** Implicitly used by the main agent for routing. Not directly
  invoked by the user.
- **Configuration:** Enabled by default. No specific configuration options.

### Browser Agent (experimental)

- **Name:** `browser_agent`
- **Purpose:** Automate web browser tasks — navigating websites, filling forms,
  clicking buttons, and extracting information from web pages — using the
  accessibility tree.
- **When to use:** "Go to example.com and fill out the contact form," "Extract
  the pricing table from this page," "Click the login button and enter my
  credentials."

<!-- prettier-ignore -->
> [!NOTE]
> This is a preview feature currently under active development.

#### Prerequisites

The browser agent requires:

- **Chrome** version 144 or later (any recent stable release will work).
- **Node.js** with `npx` available (used to launch the
  [`chrome-devtools-mcp`](https://www.npmjs.com/package/chrome-devtools-mcp)
  server).

#### Enabling the browser agent

The browser agent is disabled by default. Enable it in your `settings.json`:

```json
{
  "agents": {
    "overrides": {
      "browser_agent": {
        "enabled": true
      }
    }
  }
}
```

#### Session modes

The `sessionMode` setting controls how Chrome is launched and managed. Set it
under `agents.browser`:

```json
{
  "agents": {
    "overrides": {
      "browser_agent": {
        "enabled": true
      }
    },
    "browser": {
      "sessionMode": "persistent"
    }
  }
}
```

The available modes are:

| Mode         | Description                                                                                                                                                                                 |
| :----------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `persistent` | **(Default)** Launches Chrome with a persistent profile stored at `~/.gemini/cli-browser-profile/`. Cookies, history, and settings are preserved between sessions.                          |
| `isolated`   | Launches Chrome with a temporary profile that is deleted after each session. Use this for clean-state automation.                                                                           |
| `existing`   | Attaches to an already-running Chrome instance. You must enable remote debugging first by navigating to `chrome://inspect/#remote-debugging` in Chrome. No new browser process is launched. |

#### Configuration reference

All browser-specific settings go under `agents.browser` in your `settings.json`.

| Setting       | Type      | Default        | Description                                                                                     |
| :------------ | :-------- | :------------- | :---------------------------------------------------------------------------------------------- |
| `sessionMode` | `string`  | `"persistent"` | How Chrome is managed: `"persistent"`, `"isolated"`, or `"existing"`.                           |
| `headless`    | `boolean` | `false`        | Run Chrome in headless mode (no visible window).                                                |
| `profilePath` | `string`  | —              | Custom path to a browser profile directory.                                                     |
| `visualModel` | `string`  | —              | Model override for the visual agent (for example, `"gemini-2.5-computer-use-preview-10-2025"`). |

#### Security

The browser agent enforces the following security restrictions:

- **Blocked URL patterns:** `file://`, `javascript:`, `data:text/html`,
  `chrome://extensions`, and `chrome://settings/passwords` are always blocked.
- **Sensitive action confirmation:** Actions like form filling, file uploads,
  and form submissions require user confirmation through the standard policy
  engine.

#### Visual agent

By default, the browser agent interacts with pages through the accessibility
tree using element `uid` values. For tasks that require visual identification
(for example, "click the yellow button" or "find the red error message"), you
can enable the visual agent by setting a `visualModel`:

```json
{
  "agents": {
    "overrides": {
      "browser_agent": {
        "enabled": true
      }
    },
    "browser": {
      "visualModel": "gemini-2.5-computer-use-preview-10-2025"
    }
  }
}
```

When enabled, the agent gains access to the `analyze_screenshot` tool, which
captures a screenshot and sends it to the vision model for analysis. The model
returns coordinates and element descriptions that the browser agent uses with
the `click_at` tool for precise, coordinate-based interactions.

<!-- prettier-ignore -->
> [!NOTE]
> The visual agent requires API key or Vertex AI authentication. It is
> not available when using "Sign in with Google".

## Creating custom subagents

You can create your own subagents to automate specific workflows or enforce
specific personas. To use custom subagents, you must enable them in your
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
model: gemini-3-flash-preview
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

| Field          | Type   | Required | Description                                                                                                                                                                                                   |
| :------------- | :----- | :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`         | string | Yes      | Unique identifier (slug) used as the tool name for the agent. Only lowercase letters, numbers, hyphens, and underscores.                                                                                      |
| `description`  | string | Yes      | Short description of what the agent does. This is visible to the main agent to help it decide when to call this subagent.                                                                                     |
| `kind`         | string | No       | `local` (default) or `remote`.                                                                                                                                                                                |
| `tools`        | array  | No       | List of tool names this agent can use. Supports wildcards: `*` (all tools), `mcp_*` (all MCP tools), `mcp_server_*` (all tools from a server). **If omitted, it inherits all tools from the parent session.** |
| `model`        | string | No       | Specific model to use (e.g., `gemini-3-preview`). Defaults to `inherit` (uses the main session model).                                                                                                        |
| `temperature`  | number | No       | Model temperature (0.0 - 2.0). Defaults to `1`.                                                                                                                                                               |
| `max_turns`    | number | No       | Maximum number of conversation turns allowed for this agent before it must return. Defaults to `30`.                                                                                                          |
| `timeout_mins` | number | No       | Maximum execution time in minutes. Defaults to `10`.                                                                                                                                                          |

### Tool wildcards

When defining `tools` for a subagent, you can use wildcards to quickly grant
access to groups of tools:

- `*`: Grant access to all available built-in and discovered tools.
- `mcp_*`: Grant access to all tools from all connected MCP servers.
- `mcp_my-server_*`: Grant access to all tools from a specific MCP server named
  `my-server`.

### Isolation and recursion protection

Each subagent runs in its own isolated context loop. This means:

- **Independent history:** The subagent's conversation history does not bloat
  the main agent's context.
- **Isolated tools:** The subagent only has access to the tools you explicitly
  grant it.
- **Recursion protection:** To prevent infinite loops and excessive token usage,
  subagents **cannot** call other subagents. If a subagent is granted the `*`
  tool wildcard, it will still be unable to see or invoke other agents.

## Managing subagents

You can manage subagents interactively using the `/agents` command or
persistently via `settings.json`.

### Interactive management (/agents)

If you are in an interactive CLI session, you can use the `/agents` command to
manage subagents without editing configuration files manually. This is the
recommended way to quickly enable, disable, or re-configure agents on the fly.

For a full list of sub-commands and usage, see the
[`/agents` command reference](../reference/commands.md#agents).

### Persistent configuration (settings.json)

While the `/agents` command and agent definition files provide a starting point,
you can use `settings.json` for global, persistent overrides. This is useful for
enforcing specific models or execution limits across all sessions.

#### `agents.overrides`

Use this to enable or disable specific agents or override their run
configurations.

```json
{
  "agents": {
    "overrides": {
      "security-auditor": {
        "enabled": false,
        "runConfig": {
          "maxTurns": 20,
          "maxTimeMinutes": 10
        }
      }
    }
  }
}
```

#### `modelConfigs.overrides`

You can target specific subagents with custom model settings (like system
instruction prefixes or specific safety settings) using the `overrideScope`
field.

```json
{
  "modelConfigs": {
    "overrides": [
      {
        "match": { "overrideScope": "security-auditor" },
        "modelConfig": {
          "generateContentConfig": {
            "temperature": 0.1
          }
        }
      }
    ]
  }
}
```

### Optimizing your subagent

The main agent's system prompt encourages it to use an expert subagent when one
is available. It decides whether an agent is a relevant expert based on the
agent's description. You can improve the reliability with which an agent is used
by updating the description to more clearly indicate:

- Its area of expertise.
- When it should be used.
- Some example scenarios.

For example, the following subagent description should be called fairly
consistently for Git operations.

> Git expert agent which should be used for all local and remote git operations.
> For example:
>
> - Making commits
> - Searching for regressions with bisect
> - Interacting with source control and issues providers such as GitHub.

If you need to further tune your subagent, you can do so by selecting the model
to optimize for with `/model` and then asking the model why it does not think
that your subagent was called with a specific prompt and the given description.

## Remote subagents (Agent2Agent) (experimental)

Gemini CLI can also delegate tasks to remote subagents using the Agent-to-Agent
(A2A) protocol.

<!-- prettier-ignore -->
> [!NOTE]
> Remote subagents are currently an experimental feature.

See the [Remote Subagents documentation](remote-agents) for detailed
configuration, authentication, and usage instructions.

## Extension subagents

Extensions can bundle and distribute subagents. See the
[Extensions documentation](../extensions/index.md#subagents) for details on how
to package agents within an extension.
