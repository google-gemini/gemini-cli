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

  constructor(
    toolRegistry: ToolRegistry,
    cliConfig: Config,
    eventEmitter?: EventEmitter,
  ) {
    this.toolRegistry = toolRegistry;
    this.cliConfig = cliConfig;
    this.eventEmitter = eventEmitter;
    if (this.cliConfig.getEnableExtensionReloading()) {
      this.cliConfig
        .getExtensionLoader()
        .extensionEvents()
        .on('extensionLoaded', (event) => this.loadExtension(event.extension))
        .on('extensionEnabled', (event) => this.loadExtension(event.extension))
        .on('extensionDisabled', (event) =>
          this.unloadExtension(event.extension),
        )
        .on('extensionUnloaded', (event) =>
          this.unloadExtension(event.extension),
        );
    }
  }

  /**
   * For all the MCP servers associated with this extension:
   *
   *    - Removes all its MCP servers from the global configuration object.
   *    - Disconnects all MCP clients from their servers.
   *    - Updates the Gemini chat configuration to load the new tools.
   */
  private async unloadExtension(extension: GeminiCLIExtension) {
    debugLogger.log(`Unloading extension: ${extension.name}`);
    await Promise.all(
      Object.keys(extension.mcpServers ?? {}).map((name) => {
        const newMcpServers = {
          ...this.cliConfig.getMcpServers(),
        };
        delete newMcpServers[name];
        this.cliConfig.setMcpServers(newMcpServers);
        return this.disconnectClient(name);
      }),
    );
    // This is required to update the content generator configuration with the
    // new tool configuration.
    this.cliConfig.getGeminiClient().setTools();
  }

  /**
   * For all the MCP servers associated with this extension:
   *
   *    - Adds all its MCP servers to the global configuration object.
   *    - Connects MCP clients to each server and discovers their tools.
   *    - Updates the Gemini chat configuration to load the new tools.
   */
  private async loadExtension(extension: GeminiCLIExtension) {
    debugLogger.log(`Loading extension: ${extension.name}`);
    await Promise.all(
      Object.entries(extension.mcpServers ?? {}).map(([name, config]) => {
        this.cliConfig.setMcpServers({
          ...this.cliConfig.getMcpServers(),
          [name]: config,
        });
        return this.discoverMcpTools(name, config);
      }),
    );
    // This is required to update the content generator configuration with the
    // new tool configuration.
    this.cliConfig.getGeminiClient().setTools();
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
      }
    }
  }

  discoverMcpTools(
    name: string,
    config: MCPServerConfig,
  ): Promise<void> | void {
    if (!this.cliConfig.isTrustedFolder()) {
      return;
    }
    if (config.extension && !config.extension.isActive) {
      return;
    }

    const currentDiscoveryPromise = new Promise<void>((resolve, _reject) => {
      (async () => {
        try {
          await this.disconnectClient(name);

          const client = new McpClient(
            name,
            config,
            this.toolRegistry,
            this.cliConfig.getPromptRegistry(),
            this.cliConfig.getWorkspaceContext(),
            this.cliConfig.getDebugMode(),
          );
          this.clients.set(name, client);
          this.eventEmitter?.emit('mcp-client-update', this.clients);
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
   * Initiates the tool discovery process for all configured MCP servers.
   * It connects to each server, discovers its available tools, and registers
   * them with the `ToolRegistry`.
   */
  async discoverAllMcpTools(): Promise<void> {
    if (!this.cliConfig.isTrustedFolder()) {
      return;
    }
    await this.stop();

    const servers = populateMcpServerCommand(
      this.cliConfig.getMcpServers() || {},
      this.cliConfig.getMcpServerCommand(),
    );

    this.eventEmitter?.emit('mcp-client-update', this.clients);
    await Promise.all(
      Object.entries(servers).map(async ([name, config]) =>
        this.discoverMcpTools(name, config),
      ),
    );
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
          console.error(
            `Error stopping client '${name}': ${getErrorMessage(error)}`,
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
}
