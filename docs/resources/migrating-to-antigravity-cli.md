# Migrating to Antigravity CLI

If you’re an existing Gemini CLI user looking to migrate your workflow to
Antigravity CLI, you’ve come to the right place. This guide will help you get
familiar and up and running quickly in Antigravity CLI.

## TL;DR

Antigravity CLI supports the majority of Gemini CLI’s features. While there
isn’t 100% feature parity, workflow-defining features like _Gemini CLI
extensions_ (Antigravity plugins), _Agent Skills_, _MCP servers_, _hooks_, and
_subagents_ are supported in Antigravity CLI.

On the first launch of Antigravity CLI you should see **Migration Options**
where you can choose to migrate your existing Gemini CLI extensions to the
equivalent _Antigravity Plugins_.  
![](/docs/assets/migration-options.png)  
_Note: Some Gemini CLI extensions can not be migrated 1:1 to Antigravity plugins
as some components (e.g. custom themes, etc) may not be supported._

For the majority of users, you can now get started using Antigravity CLI with
the workflows you’ve come to love in Gemini CLI. Antigravity CLI loads in the
same context files, global Agent Skills, etc, as Gemini CLI does.

If you notice something not working the way it should or how you expect, come
back to this guide for **specific details below**.

## Extensions → Antigravity Plugins

Since Gemini CLI launched extensions (a way to extend Gemini CLI by bundling and
sharing capabilities), the industry has standardized on the term **plugins**.
[Antigravity Plugins](https://antigravity.google/docs/plugins) are supported in
Antigravity CLI.

Users should be prompted on first launch of Antigravity CLI to have their
extensions automatically migrated to plugins.

There is also an explicit command that can be run from the terminal to migrate
them:

```shell
agy plugin import gemini
```

Running the above `agy plugin import` command will find each locally installed
extension and convert them to an Antigravity plugin:

```shell
  [ok]    conductor
          - skills      : skipped (not found)
          - agents      : skipped (not found)
          ✔ commands    : 6 processed (converted to skills)
          - mcpServers  : skipped (not found)
          - hooks       : skipped (not found)
  [ok]    google-workspace
          ✔ skills      : 6 processed
          - agents      : skipped (not found)
          ✔ commands    : 4 processed (converted to skills)
          ✔ mcpServers  : 1 processed
          - hooks       : skipped (not found)
```

## Context Files (Rules)

Antigravity CLI supports the same context files as Gemini CLI. It supports
reading both `GEMINI.md` and `AGENTS.md` from your workspace and allows you to
have a global context file located at `~/.gemini/GEMINI.md`.

## Agent Skills

Agent Skills work in Antigravity CLI just as they do in Gemini CLI. They can be
managed with the same `/skills` command and are also converted into slash
commands allowing them to be manually invoked.

Global skills for Gemini CLI were located in `~/.gemini/skills/` and are shared
with Antigravity CLI across all workspaces. No action is needed for global
skills, they are picked up automatically.

Workspace specific skills for Antigravity CLI are stored in `.agents/skills`
which means if you have project/workspace skills in a given project within
the`.gemini/skills` folder they will need to be moved from to `.agents/skills`

|                | Gemini CLI                                                               | Antigravity CLI                                                                            |
| :------------- | :----------------------------------------------------------------------- | :----------------------------------------------------------------------------------------- |
| **Location**   | Global: \~/.gemini/skills/ Workspace: .gemini/skills/ or .agents/skills/ | Global: \~/.gemini/antigravity-cli/skills/ or \~/.gemini/skills Workspace: .agents/skills/ |
| **Management** | /skills                                                                  | /skills                                                                                    |
| **Behavior**   | Skills become slash commands                                             | Skills become slash commands                                                               |

_Note: Antigravity CLI does not currently have an equivalent to the
`gemini skills` commands for managing Agent Skills. You can create your own
skills files or use `npx skills install`._

## MCP Servers

Antigravity CLI supports both local and remote MCP servers and provides the same
`/mcp` command to manage MCP servers. The main difference from Gemini CLI is the
file location where `mcpServers` are defined.  
![](/docs/assets/mcp-config.png)

Antigravity and Antigravity CLI store MCP server configurations in a distinct
`mcp_config.json` file whereas Gemini CLI stores them inline in your
`settings.json`.

_Note:_ Antigravity CLI uses `serverUrl` field instead of `url` (or deprecated
`httpUrl`) for remote MCP servers.

|                | Gemini CLI                                                        | Antigravity CLI                                                                       |
| :------------- | :---------------------------------------------------------------- | :------------------------------------------------------------------------------------ |
| **Location**   | Global: \~/.gemini/settings.json Workspace: .gemini/settings.json | Global: \~/.gemini/antigravity-cli/mcp_config.json Workspace: .agents/mcp_config.json |
| **Management** | /mcp                                                              | /mcp                                                                                  |

### Local MCP server example

For local MCP servers, your `mcpServers` fields should be the same from Gemini
CLI’s `settings.json` as they are in Antigravity’s `mcp_config.json`.

For example, to configure the
[Firebase MCP server](https://firebase.google.com/docs/ai-assistance/mcp-server),
put the following in \~/.gemini/antigravity-cli/mcp_config.json to use across
all workspaces (global) or in .agents/mcp_config.json for a single workspace.

```json
{
  "mcpServers": {
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-tools@latest", "mcp"]
    }
  }
}
```

### Remote MCP server example

For remote MCP servers you can copy your `mcpServers` field but need to switch
`url` (or deprecated `httpUrl`) to be `serverUrl` which is the field Antigravity
CLI uses.

For example, here is the
[Google Developer Knowledge MCP server](https://developers.google.com/knowledge/mcp)
configuration for your `mcp_config.json` using the `serverUrl` field for
Antigravity CLI:

```json
{
  "mcpServers": {
    "google-developer-knowledge": {
      "serverUrl": "https://developerknowledge.googleapis.com/mcp",
      "authProviderType": "google_credentials",
      "oauth": {
        "scopes": ["https://www.googleapis.com/auth/cloud-platform"]
      },
      "headers": {
        "X-goog-user-project": "$GOOGLE_CLOUD_PROJECT"
      }
    }
  }
}
```

## Subagents

[Subagents in Antigravity CLI](https://antigravity.google/docs/subagents) serve
the same fundamental purpose as in Gemini CLI, acting as **specialized expert
personas** with their _own contexts_ and _tailored toolsets_.

The most critical difference between Gemini CLI and Antigravity CLI is execution
flow:

- **Gemini CLI:** Subagent delegation is **synchronous**. When the main agent
  delegates a task to a subagent, your active conversation is blocked until the
  subagent completes its work and reports back.
- **Antigravity CLI:** Subagents are **asynchronous by default**. The main agent
  can delegate parallel workloads or run background research without blocking
  your prompt interface. You can continue conversing with the main agent while
  subagents work in the background.

Antigravity CLI also has a `define_subagent` tool. This allows you to spin up
specialized assistants dynamically during an active session.

- _Example Prompt:_
  `"Create a frontend specialist subagent that excels at modern website design and accessibility audits."`

### Configuring Custom Subagents

Gemini CLI defines subagents using a single Markdown file containing YAML
frontmatter. Antigravity CLI uses a directory structure separating metadata
manifest (`agent.json`) from declarative configuration (`config.yaml`).

```
agents/
└── frontend-specialist/
    ├── agent.json        # Required marker file (metadata & routing manifest)
    └── config.yaml       # Declarative configuration (prompts, tools, MCP servers)
```

| Feature                | Gemini CLI                      | Antigravity CLI                                 |
| :--------------------- | :------------------------------ | :---------------------------------------------- |
| **Global Location**    | `~/.gemini/agents/*.md`         | `~/.gemini/antigravity-cli/agents/*/agent.json` |
| **Workspace Location** | `.gemini/agents/*.md`           | `.agents/agents/*/agent.json`                   |
| **Config Format**      | Single `.md` (YAML Frontmatter) | Split: `agent.json` \+ `config.yaml`            |
| **Execution Mode**     | Synchronous (Blocking)          | Asynchronous (Non-blocking)                     |
| **CLI Management**     | `/agents`                       | `/agents`                                       |

### Example Migration: `frontend-specialist`

Below is a complete walkthrough demonstrating how to migrate a custom Gemini CLI
subagent to Antigravity CLI.

#### Gemini CLI

The subagent for Gemini CLI is configured in
`.gemini/agents/frontend-specialist.md`.

```
---
name: frontend-specialist
description: Frontend specialist in building high-performance, accessible, and
  scalable web applications using modern frameworks and standards.
tools:
  - read_file
  - grep_search
  - glob
  - list_directory
  - web_fetch
  - google_web_search
model: inherit
---

You are a Senior Frontend Specialist Your goal is to...
<instructions>
```

#### Antigravity CLI

To migrate this agent, create a new directory named `frontend-specialist` inside
your workspace directory (`.agents/agents/frontend-specialist/`) or your global
directory.

##### 1\. Manifest File (`agent.json`)

This file acts as the discovery marker and registers the agent's metadata.

```json
{
  "name": "frontend-specialist",
  "description": "Frontend specialist in building high-performance, accessible, and scalable web applications.",
  "configPath": {
    "relativePathToConfig": "config.yaml"
  }
}
```

##### 2\. Declarative Config (`config.yaml`)

This file contains the core instructions and tools available. Notice that
Antigravity CLI uses updated tool names (e.g., `read_file` becomes `view_file`).

```
custom_agent:
  system_prompt_sections:
    - title: "Role and Core Principles"
      content: |
        You are a Senior Frontend Specialist Your goal is to...<instructions>
  tool_names:
    - view_file         # Migrated from read_file
    - grep_search       # Identical
    - find_by_name      # Migrated from glob
    - list_dir          # Migrated from list_directory
    - read_url_content  # Migrated from web_fetch
    - search_web        # Migrated from google_web_search

  # Append standard CLI context sections for smooth execution
  system_prompt_config:
    include_sections:
      - user_information
      - messaging
      - artifacts
```

#### Notable Tool Mappings During Migration

When migrating your tool lists from Gemini CLI to Antigravity CLI, ensure you
update them to match the new tool names:

| Gemini CLI Tool     | Antigravity CLI Equivalent | Description                              |
| :------------------ | :------------------------- | :--------------------------------------- |
| `read_file`         | `view_file`                | Reads local file contents.               |
| `grep_search`       | `grep_search`              | Pattern searching within files.          |
| `glob`              | `find_by_name`             | Directory and file discovery by pattern. |
| `list_directory`    | `list_dir`                 | Lists directory structures.              |
| `web_fetch`         | `read_url_content`         | Fetches raw web page content.            |
| `google_web_search` | `search_web`               | Performs web searches.                   |

## Hooks

Hooks in Antigravity CLI serve the same core purpose as in Gemini CLI, allowing
you to intercept the agentic loop to customize it to your liking and inject
context, block tools, have the agent continue, etc.

Migrating from Gemini CLI involves moving to a standalone configuration file,
adopting a simplified event model, and utilizing the interactive `/hooks`
command.

| Feature                | Gemini CLI                   | Antigravity CLI                        |
| :--------------------- | :--------------------------- | :------------------------------------- |
| **Global Location**    | `~/.gemini/settings.json`    | `~/.gemini/antigravity-cli/hooks.json` |
| **Workspace Location** | `.gemini/settings.json`      | `.agents/hooks.json`                   |
| **Config Format**      | Embedded in `settings.json`  | Standalone `hooks.json`                |
| **Top-Level Grouping** | By Event Type (`BeforeTool`) | By Hook Name (`my-hook-suite`)         |
| **Timeout Units**      | Milliseconds (e.g., `5000`)  | Seconds (e.g., `5`)                    |
| **CLI Management**     | `/hooks`                     | `/hooks`                               |

### Supported Hook Events

Here are the supported hook event types in Antigravity and their Gemini CLI
equivalent:

| Antigravity CLI Event | Gemini CLI Equivalent | Lifecycle Timing & Behavior           |
| :-------------------- | :-------------------- | :------------------------------------ |
| `PreToolUse`          | `BeforeTool`          | Executes before a tool call.          |
| `PostToolUse`         | `AfterTool`           | Executes after a tool call completes. |
| `PreInvocation`       | `BeforeModel`         | Executes before every model call.     |
| `PostInvocation`      | `AfterModel`          | Executes after every model call .     |
| `Stop`                | `AfterAgent`          | Executes when the agent finishes.     |

_Note: Antigravity CLI currently supports fewer hook types than Gemini CLI._

If you are migrating custom hook scripts, update them to match Antigravity's
updated JSON contract:

1. **Input Naming:** Payloads use `camelCase` (e.g., `toolCall.name`,
   `toolCall.args`) instead of `snake_case`.
2. **Output Flags (`PreToolUse`):** To block a tool, output
   `{"allowTool": false, "denyReason": "..."}` instead of
   `{"decision": "deny", "reason": "..."}`.

### Interactive Management (`/hooks`)

Rather than manually authoring JSON files and managing syntax formatting,
Antigravity CLI provides a built-in interactive terminal interface to view,
create, and manage hooks through the `/hooks` command.

![](/docs/assets/hooks-ui.png)

1. **Open the Panel:** Type **`/hooks`** into your prompt and press Enter.
2. **Browse Events:** Use the arrow keys to navigate through the available hook
   events (`PreToolUse`, `PreInvocation`, etc.).
3. **Create & Edit:** Select an event to add a new regex matcher, assign shell
   commands, and set timeout limits directly within the UI dialog.
4. **Toggle State:** Press **`e`** on any configured hook to instantly toggle it
   enabled or disabled without losing your configuration data.
5. **Save & Apply:** Changes made in the dialog are automatically validated and
   saved back to your `hooks.json` file.

## Migration FAQs

**Q: Will AGY CLI work in headless mode?**  
_A:_ Yes, just run `agy -p “Your awesome prompt”`

**Q: Will my chat history be migrated? How will my user context be preserved?**
_A:_ No, Gemini CLI chat sessions and history will not be migrated.

**Q: Will the policies I installed in Gemini CLI be migrated to AGY CLI?**  
_A:_ No, Antigravity does not use the same policy engine as Gemini CLI. It uses
its own permissions system which lets you set tools and commands as
`allow|deny|ask` in your Antigravity CLI `settings.json` file.
