# Technical Specification: Subagent Policy Isolation and Unique Toolsets

## Overview
This specification details the implementation of independent policies and unique, isolated toolsets for subagents. Currently, subagents inherit the primary agent's policy and toolset, which limits isolation and security. The proposed mechanism allows subagents to have private tools (built-in and MCP) that are hidden from the primary agent and subject to their own scoped policies.

## 1. YAML Frontmatter Schema
The subagent Markdown configuration (`.md` files) will be updated to support a `policy` block and an `mcp_servers` block in the YAML frontmatter.

### Schema Definition
```yaml
---
name: security-specialist
display_name: Security Specialist
description: Expert in vulnerability scanning and security audits.

# Explicitly listed tools available to the subagent
tools:
  - builtin:read_file
  - mcp:security-scanner:scan_vulnerabilities

# Scoped policy for the subagent
policy:
  tools:
    allowed:
      - "builtin:read_file"
      - "mcp:security-scanner:*"
    exclude:
      - "builtin:shell"
      - "builtin:write_file"
  mcp:
    allowed:
      - "security-scanner"
    excluded:
      - "*"
  # Trust configuration for MCP servers
  mcp_servers:
    security-scanner:
      trust: true

# MCP servers private to this subagent
mcp_servers:
  security-scanner:
    command: "npx"
    args: ["@security/mcp-server"]
    env:
      API_KEY: "${SECURITY_API_KEY}"
---
```

## 2. Orchestration and Scoping Logic
The isolation is enforced by creating a scoped execution context for each subagent.

### Scoped Config and Policy Engine
1.  **`LocalAgentExecutor.create`**: When a subagent is instantiated, it will no longer share the global `Config` directly.
2.  **Config Scoping**: A new method `Config.createScopedConfig()` will be implemented to create a lightweight fork of the configuration.
3.  **Policy Isolation**: If the subagent definition includes a `policy` block, a new `PolicyEngine` instance will be created using these settings. This engine will be used by the subagent's `ToolRegistry`.
4.  **Tool Registry Scoping**: The subagent's `ToolRegistry` will be initialized with the scoped `PolicyEngine`. It will prioritize tools explicitly defined in the subagent's `tools` list and `mcp_servers` block.

## 3. Extension Authors and Private MCP Tools
Extension authors can now define MCP servers that are only available to specific agents within that extension, hiding them from the primary agent.

### `gemini-extension.json` Updates
MCP servers in extensions can now specify a `visibility` field.
```json
{
  "name": "security-extension",
  "mcpServers": {
    "private-audit-tool": {
      "command": "...",
      "visibility": "private"
    }
  },
  "agents": [
    {
      "name": "auditor",
      "path": "agents/auditor.md"
    }
  ]
}
```
- **`visibility: "public"` (default)**: Registered globally and available to the primary agent.
- **`visibility: "private"`**: Not registered globally. The `ExtensionManager` will attach these server configurations to the agents loaded from the same extension.

## 4. Component Updates

### Agent Registry (`packages/core/src/agents/registry.ts`)
- Update `AgentDefinition` and its internal storage to hold the scoped `policy` and private `mcpServers`.
- Ensure `registerAgent` handles the ingestion of these new fields.

### Tool Registry / Dispatcher (`packages/core/src/tools/tool-registry.ts`)
- The registry will now correctly filter tools based on the scoped `PolicyEngine` provided during construction.
- It will support dynamic registration of subagent-specific MCP servers without affecting the global registry.

### Configuration Parser (`packages/core/src/agents/agentLoader.ts`)
- Update `FrontmatterLocalAgentDefinition` and `localAgentSchema` (Zod) to include the `policy` and `mcp_servers` fields.
- Update `markdownToAgentDefinition` to map these fields to the internal `AgentDefinition`.

## 5. Runtime Enforcement
Boundaries are enforced at multiple levels:
1.  **Discovery Boundary**: The primary agent's `ToolRegistry` never sees "private" or "internal" MCP tools.
2.  **Policy Boundary**: The subagent's `PolicyEngine` independently evaluates every tool call against the subagent's specific `allow`/`exclude` rules.
3.  **Execution Boundary**: `LocalAgentExecutor` validates all incoming `function_call` requests against the subagent's scoped `ToolRegistry` before scheduling execution.

---

## Implementation Roadmap

### Phase 1: Core Types and Parsing
- [ ] Update `AgentDefinition` and `LocalAgentDefinition` types in `core/agents/types.ts`.
- [ ] Update Zod schemas and parsing logic in `core/agents/agentLoader.ts`.
- [ ] Add `visibility` field to `MCPServerConfig` in `core/config/config.ts`.

### Phase 2: Configuration Scoping
- [ ] Implement `Config.createScopedConfig()` in `core/config/config.ts`.
- [ ] Update `PolicyEngine` to support initialization from `PolicySettings`.

### Phase 3: Isolated Execution
- [ ] Modify `LocalAgentExecutor.create` to use scoped config and policy.
- [ ] Implement logic to start and register subagent-specific MCP servers in the isolated `ToolRegistry`.
- [ ] Update `ExtensionManager` in `cli/config/extension-manager.ts` to handle private MCP server visibility.

### Phase 4: Validation and Testing
- [ ] Add unit tests for scoped policy enforcement.
- [ ] Add integration tests for subagent-specific MCP tools.
- [ ] Verify that private tools are not leaked to the primary agent's `ToolRegistry`.
