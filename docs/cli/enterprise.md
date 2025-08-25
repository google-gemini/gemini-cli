# Gemini CLI for the Enterprise

This document outlines configuration patterns and best practices for deploying and managing Gemini CLI in an enterprise environment. By leveraging system-level settings, administrators can enforce security policies, manage tool access, and ensure a consistent experience for all users.

> **A Note on Security:** The patterns described in this document are intended to help administrators create a more controlled and secure environment for using Gemini CLI. However, they should not be considered a foolproof security boundary. A determined user with sufficient privileges on their local machine may still be able to circumvent these configurations. These measures are designed to prevent accidental misuse and enforce corporate policy in a managed environment, not to defend against a malicious actor with local administrative rights.

## Centralized Configuration: The System Settings File

The most powerful tools for enterprise administration are the system-wide settings files. These files allow you to define a baseline configuration (`system-defaults.json`) and a set of overrides (`settings.json`) that apply to all users on a machine. For a complete overview of configuration options, see the [Configuration documentation](./configuration.md).

Settings are merged from four files. The precedence order for single-value settings (like `theme`) is:

1. System Defaults (`system-defaults.json`)
2. User Settings (`~/.gemini/settings.json`)
3. Workspace Settings (`<project>/.gemini/settings.json`)
4. System Overrides (`settings.json`)

This means the System Overrides file has the final say. For settings that are arrays (`includeDirectories`) or objects (`mcpServers`), the values are merged.

**Example of Merging and Precedence:**

Here is how settings from different levels are combined.

- **System Defaults `system-defaults.json`:**

  ```json
  {
    "theme": "default-corporate-theme",
    "includeDirectories": ["/etc/gemini-cli/common-context"]
  }
  ```

- **User `settings.json` (`~/.gemini/settings.json`):**

  ```json
  {
    "theme": "user-preferred-dark-theme",
    "mcpServers": {
      "corp-server": {
        "command": "/usr/local/bin/corp-server-dev"
      },
      "user-tool": {
        "command": "npm start --prefix ~/tools/my-tool"
      }
    },
    "includeDirectories": ["~/gemini-context"]
  }
  ```

- **Workspace `settings.json` (`<project>/.gemini/settings.json`):**

  ```json
  {
    "theme": "project-specific-light-theme",
    "mcpServers": {
      "project-tool": {
        "command": "npm start"
      }
    },
    "includeDirectories": ["./project-context"]
  }
  ```

- **System Overrides `settings.json`:**
  ```json
  {
    "theme": "system-enforced-theme",
    "mcpServers": {
      "corp-server": {
        "command": "/usr/local/bin/corp-server-prod"
      }
    },
    "includeDirectories": ["/etc/gemini-cli/global-context"]
  }
  ```

This results in the following merged configuration:

- **Final Merged Configuration:**
  ```json
  {
    "theme": "system-enforced-theme",
    "mcpServers": {
      "corp-server": {
        "command": "/usr/local/bin/corp-server-prod"
      },
      "user-tool": {
        "command": "npm start --prefix ~/tools/my-tool"
      },
      "project-tool": {
        "command": "npm start"
      }
    },
    "includeDirectories": [
      "/etc/gemini-cli/common-context",
      "~/gemini-context",
      "./project-context",
      "/etc/gemini-cli/global-context"
    ]
  }
  ```

**Why:**

- **`theme`**: The value from the system overrides (`system-enforced-theme`) is used, as it has the highest precedence.
- **`mcpServers`**: The objects are merged. The `corp-server` definition from the system overrides takes precedence over the user's definition. The unique `user-tool` and `project-tool` are included.
- **`includeDirectories`**: The arrays are concatenated in the order of System Defaults, User, Workspace, and then System Overrides.

- **Location**:
  - **Linux**: `/etc/gemini-cli/settings.json`
  - **Windows**: `C:\ProgramData\gemini-cli\settings.json`
  - **macOS**: `/Library/Application Support/GeminiCli/settings.json`
  - The path can be overridden using the `GEMINI_CLI_SYSTEM_SETTINGS_PATH` environment variable.
- **Control**: This file should be managed by system administrators and protected with appropriate file permissions to prevent unauthorized modification by users.

By using the system settings file, you can enforce the security and configuration patterns described below.

## Restricting Tool Access

You can significantly enhance security by controlling which tools the Gemini model can use. This is achieved through the `coreTools` and `excludeTools` settings. For a list of available tools, see the [Tools documentation](../tools/index.md).

### Allowlisting with `coreTools`

The most secure approach is to explicitly add the tools and commands that users are permitted to execute to an allowlist. This prevents the use of any tool not on the approved list.

**Example:** Allow only safe, read-only file operations and listing files.

```json
{
  "coreTools": ["ReadFileTool", "GlobTool", "ShellTool(ls)"]
}
```

### Blocklisting with `excludeTools`

Alternatively, you can add specific tools that are considered dangerous in your environment to a blocklist.

**Example:** Prevent the use of the shell tool for removing files.

```json
{
  "excludeTools": ["ShellTool(rm -rf)"]
}
```

**Security Note:** Blocklisting with `excludeTools` is less secure than allowlisting with `coreTools`, as it relies on blocking known-bad commands, and clever users may find ways to bypass simple string-based blocks. **Allowlisting is the recommended approach.**

## Managing Custom Tools (MCP Servers)

If your organization uses custom tools via [Model-Context Protocol (MCP) servers](../core/tools-api.md), it is crucial to understand how server configurations are managed to apply security policies effectively.

### How MCP Server Configurations are Merged

Gemini CLI loads `settings.json` files from three levels: System, Workspace, and User. When it comes to the `mcpServers` object, these configurations are **merged**:

1.  **Merging:** The lists of servers from all three levels are combined into a single list.
2.  **Precedence:** If a server with the **same name** is defined at multiple levels (e.g., a server named `corp-api` exists in both system and user settings), the definition from the highest-precedence level is used. The order of precedence is: **System > Workspace > User**.

This means a user **cannot** override the definition of a server that is already defined in the system-level settings. However, they **can** add new servers with unique names.

### Enforcing a Catalog of Tools

The security of your MCP tool ecosystem depends on a combination of defining the canonical servers and adding their names to an allowlist.

### Restricting Tools Within an MCP Server

For even greater security, especially when dealing with third-party MCP servers, you can restrict which specific tools from a server are exposed to the model. This is done using the `includeTools` and `excludeTools` properties within a server's definition. This allows you to use a subset of tools from a server without allowing potentially dangerous ones.

Following the principle of least privilege, it is highly recommended to use `includeTools` to create an allowlist of only the necessary tools.

**Example:** Only allow the `code-search` and `get-ticket-details` tools from a third-party MCP server, even if the server offers other tools like `delete-ticket`.

```json
{
  "allowMCPServers": ["third-party-analyzer"],
  "mcpServers": {
    "third-party-analyzer": {
      "command": "/usr/local/bin/start-3p-analyzer.sh",
      "includeTools": ["code-search", "get-ticket-details"]
    }
  }
}
```

#### More Secure Pattern: Define and Add to Allowlist in System Settings

To create a secure, centrally-managed catalog of tools, the system administrator **must** do both of the following in the system-level `settings.json` file:

1.  **Define the full configuration** for every approved server in the `mcpServers` object. This ensures that even if a user defines a server with the same name, the secure system-level definition will take precedence.
2.  **Add the names** of those servers to an allowlist using the `allowMCPServers` setting. This is a critical security step that prevents users from running any servers that are not on this list. If this setting is omitted, the CLI will merge and allow any server defined by the user.

**Example System `settings.json`:**

1. Add the _names_ of all approved servers to an allowlist.
   This will prevent users from adding their own servers.

2. Provide the canonical _definition_ for each server on the allowlist.

```json
{
  "allowMCPServers": ["corp-data-api", "source-code-analyzer"],
  "mcpServers": {
    "corp-data-api": {
      "command": "/usr/local/bin/start-corp-api.sh",
      "timeout": 5000
    },
    "source-code-analyzer": {
      "command": "/usr/local/bin/start-analyzer.sh"
    }
  }
}
```

This pattern is more secure because it uses both definition and an allowlist. Any server a user defines will either be overridden by the system definition (if it has the same name) or blocked because its name is not in the `allowMCPServers` list.

### Less Secure Pattern: Omitting the Allowlist

If the administrator defines the `mcpServers` object but fails to also specify the `allowMCPServers` allowlist, users may add their own servers.

**Example System `settings.json`:**

This configuration defines servers but does not enforce the allowlist.
The administrator has NOT included the "allowMCPServers" setting.

```json
{
  "mcpServers": {
    "corp-data-api": {
      "command": "/usr/local/bin/start-corp-api.sh"
    }
  }
}
```

In this scenario, a user can add their own server in their local `settings.json`. Because there is no `allowMCPServers` list to filter the merged results, the user's server will be added to the list of available tools and allowed to run.

## Enforcing Sandboxing for Security

To mitigate the risk of potentially harmful operations, you can enforce the use of sandboxing for all tool execution. The sandbox isolates tool execution in a containerized environment.

**Example:** Force all tool execution to happen within a Docker sandbox.

```json
{
  "sandbox": "docker"
}
```

You can also specify a custom, hardened Docker image for the sandbox using the `--sandbox-image` command-line argument or by building a custom `sandbox.Dockerfile` as described in the [Sandboxing documentation](./configuration.md#sandboxing).

## Controlling Network Access via Proxy

In corporate environments with strict network policies, you can configure Gemini CLI to route all outbound traffic through a corporate proxy. This can be set via an environment variable, but it can also be enforced for custom tools via the `mcpServers` configuration.

**Example (for an MCP Server):**

```json
{
  "mcpServers": {
    "proxied-server": {
      "command": "node",
      "args": ["mcp_server.js"],
      "env": {
        "HTTP_PROXY": "http://proxy.example.com:8080",
        "HTTPS_PROXY": "http://proxy.example.com:8080"
      }
    }
  }
}
```

## Telemetry and Auditing

For auditing and monitoring purposes, you can configure Gemini CLI to send telemetry data to a central location. This allows you to track tool usage and other events. For more information, see the [telemetry documentation](../telemetry.md).

**Example:** Enable telemetry and send it to a local OTLP collector. If `otlpEndpoint` is not specified, it defaults to `http://localhost:4317`.

```json
{
  "telemetry": {
    "enabled": true,
    "target": "gcp",
    "logPrompts": false
  }
}
```

**Note:** Ensure that `logPrompts` is set to `false` in an enterprise setting to avoid collecting potentially sensitive information from user prompts.

## Putting It All Together: Example System `settings.json`

Here is an example of a system `settings.json` file that combines several of the patterns discussed above to create a secure, controlled environment for Gemini CLI.

```json
{
  "sandbox": "docker",

  "coreTools": [
    "ReadFileTool",
    "GlobTool",
    "ShellTool(ls)",
    "ShellTool(cat)",
    "ShellTool(grep)"
  ],

  "mcpServers": {
    "corp-tools": {
      "command": "/opt/gemini-tools/start.sh",
      "timeout": 5000
    }
  },
  "allowMCPServers": ["corp-tools"],

  "telemetry": {
    "enabled": true,
    "target": "gcp",
    "otlpEndpoint": "https://telemetry-prod.example.com:4317",
    "logPrompts": false
  },

  "bugCommand": {
    "urlTemplate": "https://servicedesk.example.com/new-ticket?title={title}&details={info}"
  },

  "usageStatisticsEnabled": false
}
```

This configuration:

- Forces all tool execution into a Docker sandbox.
- Strictly uses an allowlist for a small set of safe shell commands and file tools.
- Defines and allows a single corporate MCP server for custom tools.
- Enables telemetry for auditing, without logging prompt content.
- Redirects the `/bug` command to an internal ticketing system.
- Disables general usage statistics collection.
