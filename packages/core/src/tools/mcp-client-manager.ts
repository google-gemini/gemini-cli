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
  // Track all configured servers (including disabled ones) for UI display
  private allServerConfigs: Map<string, MCPServerConfig> = new Map();
  private readonly clientVersion: string;
  private readonly toolRegistry: ToolRegistry;
  private readonly cliConfig: Config;
  // If we have ongoing MCP client discovery, this completes once that is done.
  private discoveryPromise: Promise<void> | undefined;
  private discoveryState: MCPDiscoveryState = MCPDiscoveryState.NOT_STARTED;
  private readonly eventEmitter?: EventEmitter;
  private pendingRefreshPromise: Promise<void> | null = null;
  private readonly blockedMcpServers: Array<{
    name: string;
    extensionName: string;
  }> = [];

  constructor(
    clientVersion: string,
    toolRegistry: ToolRegistry,
    cliConfig: Config,
    eventEmitter?: EventEmitter,
  ) {
    this.clientVersion = clientVersion;
    this.toolRegistry = toolRegistry;
    this.cliConfig = cliConfig;
    this.eventEmitter = eventEmitter;
  }

  getBlockedMcpServers() {
    return this.blockedMcpServers;
  }

  getClient(serverName: string): McpClient | undefined {
    return this.clients.get(serverName);
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
      Object.keys(extension.mcpServers ?? {}).map((name) => {
        const config = this.allServerConfigs.get(name);
        if (config?.extension?.id === extension.id) {
          this.allServerConfigs.delete(name);
          // Also remove from blocked servers if present
          const index = this.blockedMcpServers.findIndex(
            (s) => s.name === name && s.extensionName === extension.name,
          );
          if (index !== -1) {
            this.blockedMcpServers.splice(index, 1);
          }
          return this.disconnectClient(name, true);
        }
        return Promise.resolve();
      }),
    );
    await this.cliConfig.refreshMcpContext();
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
    await this.cliConfig.refreshMcpContext();
  }

  /**
   * Check if server is blocked by admin settings (allowlist/excludelist).
   * Returns true if blocked, false if allowed.
   */
  private isBlockedBySettings(name: string): boolean {
    const allowedNames = this.cliConfig.getAllowedMcpServers();
    if (
      allowedNames &&
      allowedNames.length > 0 &&
      !allowedNames.includes(name)
    ) {
      return true;
    }
    const blockedNames = this.cliConfig.getBlockedMcpServers();
    if (
      blockedNames &&
      blockedNames.length > 0 &&
      blockedNames.includes(name)
    ) {
      return true;
    }
    return false;
  }

  /**
   * Check if server is disabled by user (session or file-based).
   */
  private async isDisabledByUser(name: string): Promise<boolean> {
    const callbacks = this.cliConfig.getMcpEnablementCallbacks();
    if (callbacks) {
      if (callbacks.isSessionDisabled(name)) {
        return true;
      }
      if (!(await callbacks.isFileEnabled(name))) {
        return true;
      }
    }
    return false;
  }

  private async disconnectClient(name: string, skipRefresh = false) {
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
        if (!skipRefresh) {
          // This is required to update the content generator configuration with the
          // new tool configuration and system instructions.
          await this.cliConfig.refreshMcpContext();
        }
      }
    }
  }

  async maybeDiscoverMcpServer(
    name: string,
    config: MCPServerConfig,
  ): Promise<void> {
    // Always track server config for UI display
    this.allServerConfigs.set(name, config);

    // Check if blocked by admin settings (allowlist/excludelist)
    if (this.isBlockedBySettings(name)) {
      if (!this.blockedMcpServers.find((s) => s.name === name)) {
        this.blockedMcpServers?.push({
          name,
          extensionName: config.extension?.name ?? '',
        });
      }
      return;
    }
    // User-disabled servers: disconnect if running, don't start
    if (await this.isDisabledByUser(name)) {
      const existing = this.clients.get(name);
      if (existing) {
        await this.disconnectClient(name);
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

    const currentDiscoveryPromise = new Promise<void>((resolve, reject) => {
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
              this.cliConfig.getResourceRegistry(),
              this.cliConfig.getWorkspaceContext(),
              this.cliConfig,
              this.cliConfig.getDebugMode(),
              this.clientVersion,
              async () => {
                debugLogger.log('Tools changed, updating Gemini context...');
                await this.scheduleMcpContextRefresh();
              },
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
            // Check if this is a 401/auth error - if so, don't show as red error
            // (the info message was already shown in mcp-client.ts)
            if (!isAuthenticationError(error)) {
              // Log the error but don't let a single failed server stop the others
              const errorMessage = getErrorMessage(error);
              coreEvents.emitFeedback(
                'error',
                `Error during discovery for MCP server '${name}': ${errorMessage}`,
                error,
              );
            }
          }
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          coreEvents.emitFeedback(
            'error',
            `Error initializing MCP server '${name}': ${errorMessage}`,
            error,
          );
        } finally {
          resolve();
        }
      })().catch(reject);
    });

    if (this.discoveryPromise) {
      // Ensure the next discovery starts regardless of the previous one's success/failure
      this.discoveryPromise = this.discoveryPromise
        .catch(() => {})
        .then(() => currentDiscoveryPromise);
    } else {
      this.discoveryState = MCPDiscoveryState.IN_PROGRESS;
      this.discoveryPromise = currentDiscoveryPromise;
    }
    this.eventEmitter?.emit('mcp-client-update', this.clients);
    const currentPromise = this.discoveryPromise;
    void currentPromise
      .finally(() => {
        // If we are the last recorded discoveryPromise, then we are done, reset
        // the world.
        if (currentPromise === this.discoveryPromise) {
          this.discoveryPromise = undefined;
          this.discoveryState = MCPDiscoveryState.COMPLETED;
          this.eventEmitter?.emit('mcp-client-update', this.clients);
        }
      })
      .catch(() => {}); // Prevents unhandled rejection from the .finally branch
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

    if (Object.keys(servers).length === 0) {
      this.discoveryState = MCPDiscoveryState.COMPLETED;
      this.eventEmitter?.emit('mcp-client-update', this.clients);
      return;
    }

    // Set state synchronously before any await yields control
    if (!this.discoveryPromise) {
      this.discoveryState = MCPDiscoveryState.IN_PROGRESS;
    }

    this.eventEmitter?.emit('mcp-client-update', this.clients);
    await Promise.all(
      Object.entries(servers).map(([name, config]) =>
        this.maybeDiscoverMcpServer(name, config),
      ),
    );

    // If every configured server was skipped (for example because all are
    // disabled by user settings), no discovery promise is created. In that
    // case we must still mark discovery complete or the UI will wait forever.
    if (this.discoveryState === MCPDiscoveryState.IN_PROGRESS) {
      this.discoveryState = MCPDiscoveryState.COMPLETED;
      this.eventEmitter?.emit('mcp-client-update', this.clients);
    }

    await this.cliConfig.refreshMcpContext();
  }

  /**
   * Restarts all MCP servers (including newly enabled ones).
   */
  async restart(): Promise<void> {
    await Promise.all(
      Array.from(this.allServerConfigs.entries()).map(
        async ([name, config]) => {
          try {
            await this.maybeDiscoverMcpServer(name, config);
          } catch (error) {
            debugLogger.error(
              `Error restarting client '${name}': ${getErrorMessage(error)}`,
            );
          }
        },
      ),
    );
    await this.cliConfig.refreshMcpContext();
  }

  /**
   * Restart a single MCP server by name.
   */
  async restartServer(name: string) {
    const config = this.allServerConfigs.get(name);
    if (!config) {
      throw new Error(`No MCP server registered with the name "${name}"`);
    }
    await this.maybeDiscoverMcpServer(name, config);
    await this.cliConfig.refreshMcpContext();
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
   * All of the MCP server configurations (including disabled ones).
   */
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
