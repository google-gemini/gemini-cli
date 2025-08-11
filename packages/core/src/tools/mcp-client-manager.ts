/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPServerConfig } from '../config/config.js';
import { ToolRegistry } from './tool-registry.js';
import { PromptRegistry } from '../prompts/prompt-registry.js';
import {
  connectToMcpServer,
  discoverPrompts,
  discoverTools,
  updateMCPServerStatus,
  MCPServerStatus,
  MCPDiscoveryState,
  populateMcpServerCommand,
} from './mcp-client.js';
import { getErrorMessage } from '../utils/errors.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';

/**
 * Manages the lifecycle of multiple MCP clients, including local child processes.
 * This class is responsible for starting, stopping, and discovering tools from
 * a collection of MCP servers defined in the configuration.
 */
export class McpClientManager {
  private clients: Map<string, Client> = new Map();
  private localServers: Map<string, StdioClientTransport> = new Map();
  private mcpServers: Record<string, MCPServerConfig>;
  private mcpServerCommand: string | undefined;
  private toolRegistry: ToolRegistry;
  private promptRegistry: PromptRegistry;
  private debugMode: boolean;
  private workspaceContext: WorkspaceContext;
  private discoveryState: MCPDiscoveryState = MCPDiscoveryState.NOT_STARTED;

  constructor(
    mcpServers: Record<string, MCPServerConfig>,
    mcpServerCommand: string | undefined,
    toolRegistry: ToolRegistry,
    promptRegistry: PromptRegistry,
    debugMode: boolean,
    workspaceContext: WorkspaceContext,
  ) {
    this.mcpServers = mcpServers;
    this.mcpServerCommand = mcpServerCommand;
    this.toolRegistry = toolRegistry;
    this.promptRegistry = promptRegistry;
    this.debugMode = debugMode;
    this.workspaceContext = workspaceContext;
  }

  /**
   * Starts all configured local MCP servers as child processes.
   * This method iterates through the server configurations, identifies those
   * that are local (defined by a `command`), and spawns them.
   */
  async startLocalServers(): Promise<void> {
    const servers = populateMcpServerCommand(
      this.mcpServers,
      this.mcpServerCommand,
    );

    for (const [name, config] of Object.entries(servers)) {
      if (config.command) {
        // This is a local server, start it as a child process
        try {
          const transport = new StdioClientTransport({
            command: config.command,
            args: config.args || [],
            env: {
              ...process.env,
              ...(config.env || {}),
            } as Record<string, string>,
            cwd: config.cwd,
            stderr: 'pipe',
          });

          if (this.debugMode) {
            transport.stderr!.on('data', (data) => {
              const stderrStr = data.toString().trim();
              console.debug(`[DEBUG] [MCP STDERR (${name})]: `, stderrStr);
            });
          }

          this.localServers.set(name, transport);
        } catch (error) {
          console.error(
            `Failed to start local MCP server '${name}': ${getErrorMessage(
              error,
            )}`,
          );
        }
      }
    }
  }

  /**
   * Initiates the tool discovery process for all configured MCP servers.
   * It connects to each server, discovers its available tools, and registers
   * them with the `ToolRegistry`.
   */
  async discoverAllMcpTools(): Promise<void> {
    await this.startLocalServers();
    this.discoveryState = MCPDiscoveryState.IN_PROGRESS;
    const servers = populateMcpServerCommand(
      this.mcpServers,
      this.mcpServerCommand,
    );

    const discoveryPromises = Object.entries(servers).map(([name, config]) =>
      this.connectAndDiscover(name, config).catch((error) => {
        // Log the error but don't let a single failed server stop the others
        console.error(
          `Error during discovery for server '${name}': ${getErrorMessage(
            error,
          )}`,
        );
      }),
    );

    await Promise.all(discoveryPromises);
    this.discoveryState = MCPDiscoveryState.COMPLETED;
  }

  /**
   * Connects to a single MCP server, discovers its tools and prompts,
   * and registers them.
   *
   * @param name The name of the server.
   * @param config The configuration for the server.
   */
  private async connectAndDiscover(
    name: string,
    config: MCPServerConfig,
  ): Promise<void> {
    updateMCPServerStatus(name, MCPServerStatus.CONNECTING);
    try {
      const client = await this.connectToServer(name, config);
      this.clients.set(name, client);

      client.onerror = (error) => {
        console.error(`MCP ERROR (${name}):`, error.toString());
        updateMCPServerStatus(name, MCPServerStatus.DISCONNECTED);
      };

      await discoverPrompts(name, client, this.promptRegistry);
      const tools = await discoverTools(name, config, client);

      for (const tool of tools) {
        this.toolRegistry.registerTool(tool);
      }

      updateMCPServerStatus(name, MCPServerStatus.CONNECTED);
    } catch (error) {
      updateMCPServerStatus(name, MCPServerStatus.DISCONNECTED);
      // Re-throw the error to be caught by the caller in discoverAllMcpTools
      throw error;
    }
  }

  /**
   * Establishes a connection to a single MCP server.
   * If the server is a local child process, it uses the existing transport.
   * Otherwise, it creates a new transport.
   *
   * @param name The name of the server.
   * @param config The configuration for the server.
   * @returns A connected MCP `Client` instance.
   */
  private async connectToServer(
    name: string,
    config: MCPServerConfig,
  ): Promise<Client> {
    const client = new Client({
      name: `gemini-cli-mcp-client-${name}`,
      version: '0.0.1',
    });

    let transport: Transport;
    if (this.localServers.has(name)) {
      // Use the existing transport for the local server
      transport = this.localServers.get(name)!;
    } else {
      // Create a new transport for remote or dynamically started servers
      // This is a bit of a hack to get the transport
      const tempClient = await connectToMcpServer(
        name,
        config,
        this.debugMode,
        this.workspaceContext,
      );
      if (!tempClient.transport) {
        throw new Error(`Failed to create transport for server '${name}'`);
      }
      transport = tempClient.transport;
    }

    try {
      await client.connect(transport, {
        timeout: config.timeout,
      });
      return client;
    } catch (error) {
      await transport.close();
      throw error;
    }
  }

  /**
   * Stops all running local MCP servers and closes all client connections.
   * This is the cleanup method to be called on application exit.
   */
  async stop(): Promise<void> {
    // Stop all local server child processes
    for (const [name, transport] of this.localServers.entries()) {
      try {
        await transport.close();
        this.localServers.delete(name);
        updateMCPServerStatus(name, MCPServerStatus.DISCONNECTED);
      } catch (error) {
        console.error(
          `Error stopping local MCP server '${name}': ${getErrorMessage(
            error,
          )}`,
        );
      }
    }

    // Close all client connections
    for (const [name, client] of this.clients.entries()) {
      try {
        client.close();
        this.clients.delete(name);
        // The status is likely already disconnected, but we set it again for safety
        updateMCPServerStatus(name, MCPServerStatus.DISCONNECTED);
      } catch (error) {
        console.error(
          `Error closing client connection for '${name}': ${getErrorMessage(
            error,
          )}`,
        );
      }
    }
  }

  getDiscoveryState(): MCPDiscoveryState {
    return this.discoveryState;
  }
}
