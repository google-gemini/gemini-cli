/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * MCPManager — connect Gemini Cowork to external MCP (Model Context Protocol) servers.
 *
 * Supports two transport types:
 *   stdio — spawns a local server process (e.g. npx @modelcontextprotocol/server-github)
 *   sse   — connects to a remote server via HTTP Server-Sent Events
 *
 * Usage
 * ─────
 *   const mcp = new MCPManager();
 *
 *   await mcp.addServer({
 *     id: 'github', name: 'GitHub MCP',
 *     transport: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
 *   });
 *
 *   const tools = mcp.listAllTools();
 *   const result = await mcp.callTool('github:create_issue', { title: 'Bug', body: '...' });
 *
 * Prerequisites
 * ─────────────
 *   npm install @modelcontextprotocol/sdk --workspace @google/gemini-cowork
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MCPStdioTransport {
  type: 'stdio';
  /** Executable to spawn (e.g. 'npx', 'node', 'python'). */
  command: string;
  args?: string[];
  /** Extra environment variables merged into the child process env. */
  env?: Record<string, string>;
}

export interface MCPSSETransport {
  type: 'sse';
  /** Full URL of the SSE endpoint (e.g. 'http://localhost:3000/sse'). */
  url: string;
}

export interface MCPServerConfig {
  /** Unique identifier for this server within this MCPManager instance. */
  id: string;
  /** Human-readable display name. */
  name: string;
  transport: MCPStdioTransport | MCPSSETransport;
}

/** A tool advertised by a connected MCP server. */
export interface MCPTool {
  serverId: string;
  serverName: string;
  /** The tool's own name within its server. */
  name: string;
  description: string;
  /** JSON Schema object describing the tool's input parameters. */
  inputSchema: Record<string, unknown>;
  /**
   * Fully-qualified tool identifier: `"${serverId}:${name}"`.
   * Used when calling the tool from the agent's ToolCall.
   */
  qualifiedName: string;
}

export interface MCPCallResult {
  /** Array of content items returned by the tool (text, image, resource …). */
  content: unknown[];
  /** True when the tool reported an error condition. */
  isError: boolean;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface ConnectedServer {
  config: MCPServerConfig;
  client: Client;
  tools: Tool[];
}

// ---------------------------------------------------------------------------
// MCPManager
// ---------------------------------------------------------------------------

/**
 * Manages connections to one or more MCP servers and provides a unified
 * interface for tool discovery and invocation.
 */
export class MCPManager {
  private readonly servers = new Map<string, ConnectedServer>();

  // -------------------------------------------------------------------------
  // Server lifecycle
  // -------------------------------------------------------------------------

  /**
   * Connect to an MCP server, perform capability negotiation, and cache the
   * server's tool list.
   *
   * @throws if the transport cannot be established or the server rejects the
   *   `initialize` handshake.
   */
  async addServer(config: MCPServerConfig): Promise<void> {
    if (this.servers.has(config.id)) {
      throw new Error(`MCP server "${config.id}" is already connected.`);
    }

    const client = new Client(
      { name: 'gemini-cowork', version: '0.3.0' },
      { capabilities: { tools: {} } },
    );

    const transport =
      config.transport.type === 'stdio'
        ? new StdioClientTransport({
            command: config.transport.command,
            args: config.transport.args,
            env: {
              ...process.env,
              ...(config.transport.env ?? {}),
            } as Record<string, string>,
          })
        : new SSEClientTransport(new URL(config.transport.url));

    await client.connect(transport);

    const { tools } = await client.listTools();
    this.servers.set(config.id, { config, client, tools: tools ?? [] });
  }

  /** Disconnect a server and remove it from the registry. */
  async removeServer(id: string): Promise<void> {
    const server = this.servers.get(id);
    if (!server) return;
    try {
      await server.client.close();
    } finally {
      this.servers.delete(id);
    }
  }

  // -------------------------------------------------------------------------
  // Tool discovery
  // -------------------------------------------------------------------------

  /**
   * Return a flat list of every tool from every connected server,
   * each annotated with its `qualifiedName` (`"serverId:toolName"`).
   */
  listAllTools(): MCPTool[] {
    const result: MCPTool[] = [];
    for (const [serverId, server] of this.servers) {
      for (const t of server.tools) {
        result.push({
          serverId,
          serverName: server.config.name,
          name: t.name,
          description: t.description ?? '',
          inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
          qualifiedName: `${serverId}:${t.name}`,
        });
      }
    }
    return result;
  }

  /** Return the number of currently-connected servers. */
  get serverCount(): number {
    return this.servers.size;
  }

  // -------------------------------------------------------------------------
  // Tool invocation
  // -------------------------------------------------------------------------

  /**
   * Invoke a tool by its qualified name.
   *
   * @param qualifiedName  `"serverId:toolName"` — e.g. `"github:create_issue"`
   * @param args           Arbitrary key-value arguments forwarded to the tool.
   */
  async callTool(
    qualifiedName: string,
    args: Record<string, unknown> = {},
  ): Promise<MCPCallResult> {
    const sep = qualifiedName.indexOf(':');
    if (sep === -1) {
      throw new Error(
        `Invalid MCP tool id "${qualifiedName}". Expected "serverId:toolName".`,
      );
    }

    const serverId = qualifiedName.slice(0, sep);
    const toolName = qualifiedName.slice(sep + 1);

    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(
        `MCP server "${serverId}" is not connected. ` +
          `Connected servers: ${[...this.servers.keys()].join(', ') || 'none'}.`,
      );
    }

    const result = await server.client.callTool({ name: toolName, arguments: args });

    return {
      content: Array.isArray(result.content) ? result.content : [],
      isError: result.isError ?? false,
    };
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /** Disconnect all servers and release all resources. */
  async dispose(): Promise<void> {
    const ids = [...this.servers.keys()];
    await Promise.allSettled(ids.map((id) => this.removeServer(id)));
  }
}
