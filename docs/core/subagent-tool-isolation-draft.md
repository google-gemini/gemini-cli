# Subagent tool isolation

This document describes the subagent tool isolation feature in Gemini CLI. It
explains how to configure and restrict the tools and resources available to
specific subagents, ensuring secure and isolated execution environments.

## Overview

Subagent tool isolation moves Gemini CLI away from a single global tool
registry. Previously, subagents shared the same tool instances as the main
agent. This caused state leakage and prevented you from defining agent-specific
tool configurations.

By providing isolated execution environments, you can ensure that subagents only
interact with the parts of the system they are designed for. This prevents
unintended side effects, improves reliability by avoiding state contamination,
and enables fine-grained permission control.

With this feature, you can:

- **Specify tool access:** Define exactly which tools an agent can access using
  a `tools` list in the agent definition.
- **Define inline MCP servers:** Configure Model Context Protocol (MCP) servers
  directly in the subagent's markdown frontmatter, isolating them to that
  specific agent.
- **Maintain state isolation:** Use an isolated `MessageBus` for communication,
  as tools are cloned for each subagent.
- **Apply subagent-specific policies:** Enforce granular policy rules based on
  the executing subagent's name using TOML configuration.

## Configure a subagent

You can configure tool isolation for a subagent by updating its markdown
frontmatter. This allows you to explicitly state which tools the subagent can
use, rather than relying on the global registry.

1. Open the `.md` file for your local subagent (for example, in the
   `.gemini/skills/` or `.gemini/commands/` directory, depending on your setup).
2. Add a `tools` array to specify the permitted tools. Only the tools listed
   here will be available to the subagent.
3. Add an `mcpServers` object to define inline MCP servers that are unique to
   this agent.

### Example

The following example defines a subagent that is restricted to using only
`grep_search` and `read_file` tools. It also provisions an isolated MCP server
named `my-custom-server` that will only be accessible by this specific agent.

```yaml
---
name: my-isolated-agent
tools:
  - grep_search
  - read_file
mcpServers:
  my-custom-server:
    command: 'node'
    args: ['path/to/server.js']
---
```

## Subagent-specific policies

You can enforce fine-grained control over subagents using the Policy Engine's
TOML configuration. This prevents subagents from inheriting universal rules that
might be too permissive or restrictive for their specific tasks.

To restrict a policy rule to a specific subagent, add the `subagent` property to
the `[[rules]]` block in your `policy.toml` file.

### Example

The following example shows how to configure a policy that applies exclusively
to the `docs-writer` subagent:

```toml
[[rules]]
name = "Allow docs-writer to read docs"
subagent = "docs-writer"
description = "Permit reading files in the docs directory."
action = "allow"
tools = ["read_file"]
args = { file_path = "^docs/.*" }
```

In this configuration, the policy rule only triggers if the executing subagent's
name matches `docs-writer`. Rules without the `subagent` property apply
universally to all agents. The `LocalAgentExecutor` automatically injects the
subagent's context into the tool execution flow to ensure accurate policy
enforcement.

## How it works

The subagent tool isolation architecture relies on several core components
working together to sandbox the subagent's execution environment.

- **Agent loader:** When loading the agent from markdown, the loader parses the
  new `mcpServers` configurations and supports cloning the necessary tools from
  the global registry, preparing them for isolated use.
- **Multi-registry architecture:** The core `McpClient` and `McpClientManager`
  support multiple simultaneous `RegistrySet` instances (for tools, prompts, and
  resources). A connection-pooling mechanism keys MCP clients by a hash of their
  configuration to prevent collisions and ensure that isolated servers are
  reused safely where appropriate.
- **Execution wiring:** The `LocalAgentExecutor` is responsible for
  instantiating and using private registries during each subagent execution. It
  carefully unregisters these isolated registries after a subagent finishes to
  prevent memory leaks. It also dynamically overrides the `MessageBus` to inject
  subagent context for policy enforcement.
- **Tool filtering:** The main agent's `ToolRegistry` filters tools to ensure
  that the main agent only sees its permitted tools and remains entirely unaware
  of internal tools provisioned for subagents.
- **Context-aware enforcement:** The `PolicyEngine` evaluates the subagent
  context during tool execution and applies rules based on the `subagent` key.

## User experience improvements

When you use Gemini CLI with this feature enabled, you will notice a few
improvements in transparency and stability.

- **Agent definitions:** You have full, declarative control over `tools` and
  `mcpServers` directly in the frontmatter of local agent `.md` files. This
  makes agent capabilities easier to understand at a glance.
- **Granular permissions:** The TOML configuration provides precise permission
  control, allowing you to tailor access strictly to what each subagent
  requires.
- **UI notifications:** Gemini CLI displays the names of any custom MCP servers
  a new local agent introduces in the permission dialog. This provides crucial
  transparency before you enable a new agent.
- **Improved reliability:** Because subagents operate with isolated tool states,
  you are less likely to encounter "hallucinations" or errors caused by shared
  tool state bleeding over from previous conversational turns.

## Next steps

- Learn more about [subagents](subagents.md) and how they fit into the Gemini
  CLI ecosystem.
- Explore the [Model Context Protocol (MCP)](../resources/mcp.md) to understand
  how to build custom servers for your subagents.
- Read more about configuring policies in the
  [Policy Engine](../reference/policy-engine.md) documentation.
