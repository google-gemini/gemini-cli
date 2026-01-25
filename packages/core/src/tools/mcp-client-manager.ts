/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Config,
  GeminiCLIExtension,
  MCPServerConfig,
} from '../config/config.js';
import type { ToolRegistry } from './tool-registry.js';
import {
  McpClient,
  MCPDiscoveryState,
  populateMcpServerCommand,
} from './mcp-client.js';
import { getErrorMessage, isAuthenticationError } from '../utils/errors.js';
import { coreEvents, CoreEvent } from '../utils/events.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Manages the lifecycle of multiple MCP clients, including local child processes.
 * This class is responsible for starting, stopping, and discovering tools from
 * a collection of MCP servers defined in the configuration.
 */
export class McpClientManager {
  private clients: Map<string, McpClient> = new Map();
  // Track all configured servers (including disabled ones) for UI display
  private allServerConfigs: Map<string, MCPServerConfig> = new Map();
  private readonly clientVersion: string;
  private readonly toolRegistry: ToolRegistry;
  private readonly cliConfig: Config;
  // If we have ongoing MCP client discovery, this completes once that is done.
  private discoveryPromise: Promise<void> | undefined;
  private discoveryState: MCPDiscoveryState = MCPDiscoveryState.NOT_STARTED;
  private pendingRefreshPromise: Promise<void> | null = null;

  constructor(clientVersion: string, toolRegistry: ToolRegistry, cliConfig: Config) {
    this.clientVersion = clientVersion;
    this.toolRegistry = toolRegistry;
    this.cliConfig = cliConfig;
    
    // Listen for config changes to refresh MCP context
    coreEvents.on(CoreEvent.AgentsRefreshed, () => {
       this.scheduleMcpContextRefresh();
    });
  }

  async start(): Promise<void> {
    if (this.discoveryState === MCPDiscoveryState.IN_PROGRESS) {
      return this.discoveryPromise;
    }
    
    this.discoveryState = MCPDiscoveryState.IN_PROGRESS;
    this.discoveryPromise = this.internalStart();
    return this.discoveryPromise;
  }

  private async internalStart(): Promise<void> {
    const servers = this.cliConfig.getMcpServers() || {};
    this.allServerConfigs = new Map(Object.entries(servers));

    const promises = Object.entries(servers).map(async ([name, config]) => {
      if (config.enabled === false) {
        return;
      }
      
      try {
        // Simple pooling: reuse existing client if healthy
        let client = this.clients.get(name);
        if (client) {
          try {
            await client.ping();
            debugLogger.debug(`Reusing healthy MCP client for ${name}`);
            return;
          } catch (e) {
            debugLogger.debug(`MCP client for ${name} is unhealthy, restarting...`);
            await client.stop();
            this.clients.delete(name);
          }
        }

        client = new McpClient(name, config, this.clientVersion, this.cliConfig);
        this.clients.set(name, client);
        await client.start();
        
        const tools = await client.getTools();
        for (const tool of tools) {
           this.toolRegistry.register(tool);
        }
      } catch (error) {
        debugLogger.error(`Failed to start MCP server ${name}: ${getErrorMessage(error)}`);
      }
    });

    await Promise.all(promises);
    this.discoveryState = MCPDiscoveryState.COMPLETED;
  }

  async stop(): Promise<void> {
    const promises = Array.from(this.clients.values()).map(client => client.stop());
    await Promise.all(promises);
    this.clients.clear();
  }

  getDiscoveryState(): MCPDiscoveryState {
    return this.discoveryState;
  }

  getMcpServers(): Record<string, MCPServerConfig> {
    const mcpServers: Record<string, MCPServerConfig> = {};
    for (const [name, config] of this.allServerConfigs.entries()) {
      mcpServers[name] = config;
    }
    return mcpServers;
  }

  getMcpInstructions(): string {
    const instructions: string[] = [];
    for (const [name, client] of this.clients) {
      const clientInstructions = client.getInstructions();
      if (clientInstructions) {
        instructions.push(
          `The following are instructions provided by the tool server '${name}':\n---[start of server instructions]---\n${clientInstructions}\n---[end of server instructions]---`,
        );
      }
    }
    return instructions.join('\n\n');
  }

  private async scheduleMcpContextRefresh(): Promise<void> {
    if (this.pendingRefreshPromise) {
      return this.pendingRefreshPromise;
    }

    this.pendingRefreshPromise = (async () => {
      // Debounce to coalesce multiple rapid updates
      await new Promise((resolve) => setTimeout(resolve, 300));
      try {
        await this.cliConfig.refreshMcpContext();
      } catch (error) {
        debugLogger.error(
          `Error refreshing MCP context: ${getErrorMessage(error)}`,
        );
      } finally {
        this.pendingRefreshPromise = null;
      }
    })();

    return this.pendingRefreshPromise;
  }

  getMcpServerCount(): number {
    return this.clients.size;
  }
}
