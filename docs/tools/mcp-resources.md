# MCP resource tools

MCP resource tools let Gemini CLI discover and retrieve data from contextual
resources exposed by Model Context Protocol (MCP) servers.

## 1. `list_mcp_resources` (ListMcpResources)

`list_mcp_resources` retrieves a list of all available resources from connected
MCP servers. This is primarily a discovery tool that helps the model understand
what external data sources are available for reference.

- **Tool name:** `list_mcp_resources`
- **Display name:** List MCP Resources
- **Kind:** `Search`
- **File:** `list-mcp-resources.ts`
- **Parameters:**
  - `serverName` (string, optional): An optional filter to list resources from a
    specific server.
- **Behavior:**
  - Iterates through all connected MCP servers.
  - Fetches the list of resources each server exposes.
  - Formats the results into a plain-text list of URIs and descriptions.
- **Output (`llmContent`):** A formatted list of available resources, including
  their URI, server name, and optional description.
- **Confirmation:** No. This is a read-only discovery tool.

## 2. `read_mcp_resource` (ReadMcpResource)

`read_mcp_resource` retrieves the content of a specific resource identified by
its URI.

- **Tool name:** `read_mcp_resource`
- **Display name:** Read MCP Resource
- **Kind:** `Read`
- **File:** `read-mcp-resource.ts`
- **Parameters:**
  - `uri` (string, required): The URI of the MCP resource to read.
- **Behavior:**
  - Locates the resource and its associated server by URI.
  - Calls the server's `resources/read` method.
  - Processes the response, extracting text or binary data.
- **Output (`llmContent`):** The content of the resource. For binary data, it
  returns a placeholder indicating the data type.
- **Confirmation:** No. This is a read-only retrieval tool.
