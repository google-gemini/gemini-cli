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
import { getErrorMessage } from '../utils/errors.js';
import type { EventEmitter } from 'node:events';
import { coreEvents } from '../utils/events.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Manages the lifecycle of multiple MCP clients, including local child processes.
 * This class is responsible for starting, stopping, and discovering tools from
 * a collection of MCP servers defined in the configuration.
 */
export class McpClientManager {
  private clients: Map<string, McpClient> = new Map();
  private readonly toolRegistry: ToolRegistry;
  private readonly cliConfig: Config;
  // If we have ongoing MCP client discovery, this completes once that is done.
  private discoveryPromise: Promise<void> | undefined;
  private discoveryState: MCPDiscoveryState = MCPDiscoveryState.NOT_STARTED;
  private readonly eventEmitter?: EventEmitter;
  private readonly blockedMcpServers: Array<{
    name: string;
    extensionName: string;
  }> = [];

  constructor(
    toolRegistry: ToolRegistry,
    cliConfig: Config,
    eventEmitter?: EventEmitter,
  ) {
    this.toolRegistry = toolRegistry;
    this.cliConfig = cliConfig;
    this.eventEmitter = eventEmitter;
  }

  getBlockedMcpServers() {
    return this.blockedMcpServers;
  }

  /**
   * For all the MCP servers associated with this extension:
   *
   *    - Removes all its MCP servers from the global configuration object.
   *    - Disconnects all MCP clients from their servers.
   *    - Updates the Gemini chat configuration to load the new tools.
   */
  async stopExtension(extension: GeminiCLIExtension) {
    debugLogger.log(`Unloading extension: ${extension.name}`);
    await Promise.all(
      Object.keys(extension.mcpServers ?? {}).map(
        this.disconnectClient.bind(this),
      ),
    );
  }

  /**
   * For all the MCP servers associated with this extension:
   *
   *    - Adds all its MCP servers to the global configuration object.
   *    - Connects MCP clients to each server and discovers their tools.
   *    - Updates the Gemini chat configuration to load the new tools.
   */
  async startExtension(extension: GeminiCLIExtension) {
    debugLogger.log(`Loading extension: ${extension.name}`);
    await Promise.all(
      Object.entries(extension.mcpServers ?? {}).map(([name, config]) =>
        this.maybeDiscoverMcpServer(name, {
          ...config,
          extension,
        }),
      ),
    );
  }

  private isAllowedMcpServer(name: string) {
    const allowedNames = this.cliConfig.getAllowedMcpServers();
    if (
      allowedNames &&
      allowedNames.length > 0 &&
      allowedNames.indexOf(name) === -1
    ) {
      return false;
    }
    const blockedNames = this.cliConfig.getBlockedMcpServers();
    if (
      blockedNames &&
      blockedNames.length > 0 &&
      blockedNames.indexOf(name) !== -1
    ) {
      return false;
    }
    return true;
  }

  private async disconnectClient(name: string) {
    const existing = this.clients.get(name);
    if (existing) {
      try {
        this.clients.delete(name);
        this.eventEmitter?.emit('mcp-client-update', this.clients);
        await existing.disconnect();
      } catch (error) {
        debugLogger.warn(
          `Error stopping client '${name}': ${getErrorMessage(error)}`,
        );
      } finally {
        // This is required to update the content generator configuration with the
        // new tool configuration.
        const geminiClient = this.cliConfig.getGeminiClient();
        if (geminiClient.isInitialized()) {
          await geminiClient.setTools();
        }
      }
    }
  }

  maybeDiscoverMcpServer(
    name: string,
    config: MCPServerConfig,
  ): Promise<void> | void {
    if (!this.isAllowedMcpServer(name)) {
      if (!this.blockedMcpServers.find((s) => s.name === name)) {
        this.blockedMcpServers?.push({
          name,
          extensionName: config.extension?.name ?? '',
        });
      }
      return;
    }
    if (!this.cliConfig.isTrustedFolder()) {
      return;
    }
    if (config.extension && !config.extension.isActive) {
      return;
    }
    const existing = this.clients.get(name);
    if (existing && existing.getServerConfig().extension !== config.extension) {
      const extensionText = config.extension
        ? ` from extension "${config.extension.name}"`
        : '';
      debugLogger.warn(
        `Skipping MCP config for server with name "${name}"${extensionText} as it already exists.`,
      );
      return;
    }

    const currentDiscoveryPromise = new Promise<void>((resolve, _reject) => {
      (async () => {
        try {
          if (existing) {
            await existing.disconnect();
          }

          const client =
            existing ??
            new McpClient(
              name,
              config,
              this.toolRegistry,
              this.cliConfig.getPromptRegistry(),
              this.cliConfig.getWorkspaceContext(),
              this.cliConfig.getDebugMode(),
            );
          if (!existing) {
            this.clients.set(name, client);
            this.eventEmitter?.emit('mcp-client-update', this.clients);
          }
          try {
            await client.connect();
            await client.discover(this.cliConfig);
            this.eventEmitter?.emit('mcp-client-update', this.clients);
          } catch (error) {
            this.eventEmitter?.emit('mcp-client-update', this.clients);
            // Log the error but don't let a single failed server stop the others
            coreEvents.emitFeedback(
              'error',
              `Error during discovery for server '${name}': ${getErrorMessage(
                error,
              )}`,
              error,
            );
          }
        } finally {
          // This is required to update the content generator configuration with the
          // new tool configuration.
          const geminiClient = this.cliConfig.getGeminiClient();
          if (geminiClient.isInitialized()) {
            await geminiClient.setTools();
          }
          resolve();
        }
      })();
    });

    if (this.discoveryPromise) {
      this.discoveryPromise = this.discoveryPromise.then(
        () => currentDiscoveryPromise,
      );
    } else {
      this.discoveryState = MCPDiscoveryState.IN_PROGRESS;
      this.discoveryPromise = currentDiscoveryPromise;
    }
    this.eventEmitter?.emit('mcp-client-update', this.clients);
    const currentPromise = this.discoveryPromise;
    currentPromise.then((_) => {
      // If we are the last recorded discoveryPromise, then we are done, reset
      // the world.
      if (currentPromise === this.discoveryPromise) {
        this.discoveryPromise = undefined;
        this.discoveryState = MCPDiscoveryState.COMPLETED;
      }
    });
    return currentPromise;
  }

  /**
   * Initiates the tool discovery process for all configured MCP servers (via
   * gemini settings or command line arguments).
   *
   * It connects to each server, discovers its available tools, and registers
   * them with the `ToolRegistry`.
   *
   * For any server which is already connected, it will first be disconnected.
   *
   * This does NOT load extension MCP servers - this happens when the
   * ExtensionLoader explicitly calls `loadExtension`.
   */
  async startConfiguredMcpServers(): Promise<void> {
    if (!this.cliConfig.isTrustedFolder()) {
      return;
    }

    const servers = populateMcpServerCommand(
      this.cliConfig.getMcpServers() || {},
      this.cliConfig.getMcpServerCommand(),
    );

    this.eventEmitter?.emit('mcp-client-update', this.clients);
    await Promise.all(
      Object.entries(servers).map(([name, config]) =>
        this.maybeDiscoverMcpServer(name, config),
      ),
    );
  }

  /**
   * Restarts all active MCP Clients.
   */
  async restart(): Promise<void> {
    await Promise.all(
      Array.from(this.clients.entries()).map(async ([name, client]) => {
        try {
          await this.maybeDiscoverMcpServer(name, client.getServerConfig());
        } catch (error) {
          debugLogger.error(
            `Error restarting client '${name}': ${getErrorMessage(error)}`,
          );
        }
      }),
    );
  }

  /**
   * Restart a single MCP server by name.
   */
  async restartServer(name: string) {
    const client = this.clients.get(name);
    if (!client) {
      throw new Error(`No MCP server registered with the name "${name}"`);
    }
    await this.maybeDiscoverMcpServer(name, client.getServerConfig());
  }

  /**
   * Stops all running local MCP servers and closes all client connections.
   * This is the cleanup method to be called on application exit.
   */
  async stop(): Promise<void> {
    const disconnectionPromises = Array.from(this.clients.entries()).map(
      async ([name, client]) => {
        try {
          await client.disconnect();
        } catch (error) {
          coreEvents.emitFeedback(
            'error',
            `Error stopping client '${name}':`,
            error,
          );
        }
      },
    );

    await Promise.all(disconnectionPromises);
    this.clients.clear();
  }

  getDiscoveryState(): MCPDiscoveryState {
    return this.discoveryState;
  }

  /**
   * All of the MCP server configurations currently loaded.
   */
  getMcpServers(): Record<string, MCPServerConfig> {
    const mcpServers: Record<string, MCPServerConfig> = {};
    for (const [name, client] of this.clients.entries()) {
      mcpServers[name] = client.getServerConfig();
    }
    return mcpServers;
  }
}
