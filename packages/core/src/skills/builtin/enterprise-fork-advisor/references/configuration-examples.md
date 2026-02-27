# Configuration Examples

Copy-paste snippets for the most common enterprise configurations.

---

## settings.json Snippets

### Lock down tool access (whitelist)

```json
{
  "tools": {
    "allowedTools": [
      "read_file",
      "glob",
      "grep_search",
      "web_search",
      "web_fetch"
    ]
  }
}
```

### Block dangerous tools (blacklist)

```json
{
  "tools": {
    "excludeTools": ["shell", "write_file", "edit"]
  }
}
```

### Require approval before every tool call

```json
{
  "general": {
    "defaultApprovalMode": "default"
  }
}
```

### Plan-only mode (model explains, never executes)

```json
{
  "general": {
    "defaultApprovalMode": "plan"
  }
}
```

### Disable telemetry

```json
{
  "general": {
    "telemetry": false
  }
}
```

### Add a corporate MCP server (stdio)

```json
{
  "mcpServers": {
    "corp-internal": {
      "command": "node",
      "args": ["/opt/corp/gemini-mcp-server/index.js"],
      "env": {
        "CORP_API_KEY": "${CORP_API_KEY}"
      },
      "trust": true
    }
  }
}
```

### Add a corporate MCP server (HTTP/SSE)

```json
{
  "mcpServers": {
    "corp-search": {
      "url": "https://internal.corp.example/mcp",
      "headers": {
        "Authorization": "Bearer ${CORP_TOKEN}"
      },
      "transport": "http-sse",
      "trust": true
    }
  }
}
```

### Audit hook — log every tool call to a file

```json
{
  "hooks": {
    "PostToolCall": [
      {
        "command": "bash -c 'echo \"$(date -u) TOOL=$GEMINI_TOOL_NAME\" >> /var/log/gemini-audit.log'"
      }
    ]
  }
}
```

### PreToolCall hook — block shell commands matching a pattern

```json
{
  "hooks": {
    "PreToolCall": [
      {
        "command": "/opt/corp/scripts/gemini-shell-guard.sh",
        "timeout": 5000
      }
    ]
  }
}
```

`gemini-shell-guard.sh` should exit with code `2` to block the tool call (exit
`0` to allow).

---

## Extension: gemini-extension.json

A complete enterprise extension manifest:

```json
{
  "name": "acme-corp",
  "version": "1.0.0",
  "description": "ACME Corp standard Gemini CLI configuration",
  "contextFileName": ["corp-context.md"],
  "excludeTools": ["shell"],
  "mcpServers": {
    "acme-jira": {
      "command": "node",
      "args": ["${extensionDir}/mcp-servers/jira/index.js"],
      "env": {
        "JIRA_BASE_URL": "${JIRA_BASE_URL}",
        "JIRA_TOKEN": "${JIRA_TOKEN}"
      },
      "trust": true
    },
    "acme-confluence": {
      "command": "node",
      "args": ["${extensionDir}/mcp-servers/confluence/index.js"],
      "trust": true
    }
  },
  "settings": [
    {
      "key": "general.defaultApprovalMode",
      "value": "default",
      "description": "Require user approval for all tool calls per ACME security policy"
    },
    {
      "key": "general.telemetry",
      "value": false
    }
  ],
  "themes": [
    {
      "name": "acme-dark",
      "colors": {
        "primary": "#003087",
        "secondary": "#CC0000",
        "background": "#1a1a2e"
      }
    }
  ]
}
```

### corp-context.md (contextFileName content)

```markdown
# ACME Corp — Gemini CLI Context

You are assisting ACME Corp engineers. Always follow these guidelines:

- Do not access external URLs without explicit user approval.
- Prefer internal Jira (use `acme-jira` MCP tools) over creating local tracking
  files.
- All code changes must include unit tests.
- Reference the ACME coding standards: https://internal.acme.example/standards
- For data handling questions, consult the Data Governance team first.
```

---

## System-Level Policy (TOML)

Place at `/etc/gemini-cli/policies/security.toml` (Linux/macOS) or
`C:\ProgramData\gemini-cli\policies\security.toml` (Windows).

```toml
# Enforce minimum approval mode and disable telemetry org-wide
[general]
defaultApprovalMode = "default"
telemetry = false

# Block shell tool entirely at system level
[tools]
excludeTools = ["shell"]
```

Policy files are evaluated **before** user and workspace settings and cannot be
overridden by users.

---

## Environment Variables

| Variable                     | Purpose                                     |
| ---------------------------- | ------------------------------------------- |
| `GEMINI_API_KEY`             | Gemini API authentication                   |
| `GEMINI_API_BASE_URL`        | Override API endpoint (e.g., on-prem model) |
| `HTTPS_PROXY` / `HTTP_PROXY` | Corporate HTTP proxy                        |
| `NODE_EXTRA_CA_CERTS`        | Path to custom CA certificate bundle        |
| `GEMINI_MODEL`               | Default model name                          |
| `GEMINI_WORKSPACE_TRUST`     | Pre-trust workspace (CI environments)       |

These can be set in your corporate shell profile (`/etc/environment`, `.bashrc`,
Group Policy, etc.) without any Gemini CLI source changes.
