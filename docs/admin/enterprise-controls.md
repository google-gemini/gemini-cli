# Enterprise Admin Controls

Gemini CLI empowers enterprise administrators to manage and enforce security
policies and configuration settings across their entire organization. Secure
defaults are enabled automatically for all enterprise users, but can be
customized via the [Management Console](https://goo.gle/manage-gemini-cli).

**Enterprise Admin Controls are enforced globally and cannot be overridden by
users locally**, ensuring a consistent security posture.

## Admin Controls vs. System Settings

While [System-wide settings](../cli/settings.md) act as convenient configuration
overrides, they can still be modified by users with sufficient privileges. In
contrast, admin controls are immutable at the local level, making them the
preferred method for enforcing policy.

## Available Controls

### Strict Mode

**Enabled/Disabled** | Default: enabled

If enabled, users will not be able to enter yolo mode.

### Extensions

**Enabled/Disabled** | Default: disabled

If disabled, users will not be able to use or install extensions. See
[Extensions](../extensions/index.md) for more details.

### MCP

#### Enabled/Disabled

**Enabled/Disabled** | Default: disabled

If disabled, users will not be able to use MCP servers. See
[MCP Server Integration](../tools/mcp-server.md) for more details.

#### MCP Servers (preview)

**Default**: empty

Allows administrators to define an explicit allowlist of MCP servers. This
guarantees that users can only connect to trusted MCP servers defined by the
organization.

**Allowlist Format:**

```json
{
  "mcpServers": {
    "external-provider": {
      "url": "https://api.mcp-provider.com",
      "type": "sse",
      "trust": true,
      "includeTools": ["toolA", "toolB"],
      "excludeTools": []
    },
    "internal-corp-tool": {
      "url": "https://mcp.internal-tool.corp",
      "type": "http",
      "includeTools": [],
      "excludeTools": ["adminTool"]
    }
  }
}
```

**Supported Fields:**

- `url`: (Required) The full URL of the MCP server endpoint.
- `type`: (Required) The connection type (for example, `sse` or `http`).
- `trust`: (Optional) If set to `true`, the server is trusted and tool execution
  will not require user approval.
- `includeTools`: (Optional) An explicit list of tool names to allow. If
  specified, only these tools will be available.
- `excludeTools`: (Optional) A list of tool names to hide. These tools will be
  blocked.

**Client Enforcement Logic:**

- **Empty Allowlist**: If the admin allowlist is empty, the client uses the
  user’s local configuration as is (unless the MCP toggle above is disabled).
- **Active Allowlist**: If the allowlist contains one or more servers, **all
  locally configured servers not present in the allowlist are ignored**.
- **Configuration Merging**: For a server to be active, it must exist in
  **both** the admin allowlist and the user’s local configuration (matched by
  name). The client merges these definitions as follows:
  - **Override Fields**: The `url`, `type`, & `trust` are always taken from the
    admin allowlist, overriding any local values.
  - **Tools Filtering**: If `includeTools` or `excludeTools` are defined in the
    allowlist, the admin’s rules are used exclusively. If both are undefined in
    the admin allowlist, the client falls back to the user’s local tool
    settings.
  - **Cleared Fields**: To ensure security and consistency, the client
    automatically clears local execution fields (`command`, `args`, `env`,
    `cwd`, `httpUrl`, `tcp`). This prevents users from overriding the connection
    method.
  - **Other Fields**: All other MCP fields are pulled from the user’s local
    configuration.
- **Missing Allowlisted Servers**: If a server appears in the admin allowlist
  but is missing from the local configuration, it will not be initialized. This
  ensures users maintain final control over which permitted servers are actually
  active in their environment.

#### Required MCP Servers (preview)

**Default**: empty

Allows administrators to define MCP servers that are **always injected** into
the user's environment. Unlike the allowlist (which filters user-configured
servers), required servers are automatically added regardless of the user's
local configuration.

**Required Servers Format:**

```json
{
  "requiredMcpServers": {
    "corp-compliance-tool": {
      "url": "https://mcp.corp/compliance",
      "type": "http",
      "trust": true,
      "description": "Corporate compliance tool"
    },
    "internal-registry": {
      "url": "https://registry.corp/mcp",
      "type": "sse",
      "authProviderType": "google_credentials",
      "oauth": {
        "scopes": ["https://www.googleapis.com/auth/scope"]
      }
    }
  }
}
```

**Supported Fields:**

- `url`: (Required) The full URL of the MCP server endpoint.
- `type`: (Required) The connection type (`sse` or `http`).
- `trust`: (Optional) If set to `true`, tool execution will not require user
  approval. Defaults to `true` for required servers.
- `description`: (Optional) Human-readable description of the server.
- `authProviderType`: (Optional) Authentication provider (`dynamic_discovery`,
  `google_credentials`, or `service_account_impersonation`).
- `oauth`: (Optional) OAuth configuration including `scopes`, `clientId`, and
  `clientSecret`.
- `targetAudience`: (Optional) OAuth target audience for service-to-service
  auth.
- `targetServiceAccount`: (Optional) Service account email to impersonate.
- `headers`: (Optional) Additional HTTP headers to send with requests.
- `includeTools` / `excludeTools`: (Optional) Tool filtering lists.
- `timeout`: (Optional) Timeout in milliseconds for MCP requests.

**Client Enforcement Logic:**

- Required servers are injected **after** allowlist filtering, so they are
  always available even if the allowlist is active.
- If a required server has the **same name** as a locally configured server, the
  admin configuration **completely overrides** the local one.
- Required servers only support remote transports (`sse`, `http`). Local
  execution fields (`command`, `args`, `env`, `cwd`) are not supported.
- Required servers can coexist with allowlisted servers — both features work
  independently.

### Unmanaged Capabilities

**Enabled/Disabled** | Default: disabled

If disabled, users will not be able to use certain features. Currently, this
control disables Agent Skills. See [Agent Skills](../cli/skills.md) for more
details.
