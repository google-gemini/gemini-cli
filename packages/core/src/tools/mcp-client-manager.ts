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
  MCPServerStatus,
  populateMcpServerCommand,
} from './mcp-client.js';
import { getErrorMessage, isAuthenticationError } from '../utils/errors.js';
import type { EventEmitter } from 'node:events';
import { coreEvents } from '../utils/events.js';
import { debugLogger } from '../utils/debugLogger.js';

import { createHash } from 'node:crypto';
import { stableStringify } from '../policy/stable-stringify.js';
import type { PromptRegistry } from '../prompts/prompt-registry.js';
import type {
  ResourceRegistry,
  MCPResource,
} from '../resources/resource-registry.js';

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

  private mainToolRegistry: ToolRegistry | undefined;
  private mainPromptRegistry: PromptRegistry | undefined;
  private mainResourceRegistry: ResourceRegistry | undefined;

  /**
   * Track whether the user has explicitly interacted with MCP in this session
   * (e.g. by running an /mcp command).
   */
  private userInteractedWithMcp: boolean = false;

  /**
   * Track which MCP diagnostics have already been shown to the user this session
   * and at what verbosity level.
   */
  private shownDiagnostics: Map<string, 'silent' | 'verbose'> = new Map();

  /**
   * Track whether the MCP "hint" has been shown.
   */
  private hintShown: boolean = false;

  /**
   * Track the last error message for each server.
   */
  private lastErrors: Map<string, string> = new Map();

  constructor(
    clientVersion: string,
    cliConfig: Config,
    eventEmitter?: EventEmitter,
  ) {
    this.clientVersion = clientVersion;
    this.cliConfig = cliConfig;
    this.eventEmitter = eventEmitter;
  }

  setMainRegistries(registries: {
    toolRegistry: ToolRegistry;
    promptRegistry: PromptRegistry;
    resourceRegistry: ResourceRegistry;
  }) {
    this.mainToolRegistry = registries.toolRegistry;
    this.mainPromptRegistry = registries.promptRegistry;
    this.mainResourceRegistry = registries.resourceRegistry;
  }

  setUserInteractedWithMcp() {
    this.userInteractedWithMcp = true;
  }

  getLastError(serverName: string): string | undefined {
    return this.lastErrors.get(serverName);
  }

  /**
   * Emit an MCP diagnostic message, adhering to the user's intent and
   * deduplication rules.
   */
  emitDiagnostic(
    severity: 'info' | 'warning' | 'error',
    message: string,
    error?: unknown,
    serverName?: string,
  ) {
    // Capture error for later display if it's an error/warning
    if (severity === 'error' || severity === 'warning') {
      if (serverName) {
        this.lastErrors.set(serverName, message);
      }
    }

    // Deduplicate
    const diagnosticKey = `${severity}:${message}`;
    const previousStatus = this.shownDiagnostics.get(diagnosticKey);

    // If user has interacted, show verbosely unless already shown verbosely
    if (this.userInteractedWithMcp) {
      if (previousStatus === 'verbose') {
        debugLogger.debug(
          `Deduplicated verbose MCP diagnostic: ${diagnosticKey}`,
        );
        return;
      }
      this.shownDiagnostics.set(diagnosticKey, 'verbose');
      coreEvents.emitFeedback(severity, message, error);
      return;
    }

    // In silent mode, if it has been shown at all, skip
    if (previousStatus) {
      debugLogger.debug(`Deduplicated silent MCP diagnostic: ${diagnosticKey}`);
      return;
    }
    this.shownDiagnostics.set(diagnosticKey, 'silent');

    // Otherwise, be less annoying
    debugLogger.log(`[MCP ${severity}] ${message}`, error);

    if (severity === 'error' || severity === 'warning') {
      if (!this.hintShown) {
        this.hintShown = true;
        coreEvents.emitFeedback(
          'info',
          'MCP issues detected. Run /mcp list for status.',
        );
      }
    }
  }

  getBlockedMcpServers() {
    return this.blockedMcpServers;
  }

  getClient(serverName: string): McpClient | undefined {
    for (const client of this.clients.values()) {
      if (client.getServerName() === serverName) {
        return client;
      }
    }
    return undefined;
  }

  findResourceByUri(uri: string): MCPResource | undefined {
    if (!this.mainResourceRegistry) return undefined;

    // Try serverName:uri format first
    const qualifiedMatch = this.mainResourceRegistry.findResourceByUri(uri);
    if (qualifiedMatch) {
      return qualifiedMatch;
    }

    // Try direct URI match
    return this.mainResourceRegistry
      .getAllResources()
      .find((r) => r.uri === uri);
  }

  getAllResources(): MCPResource[] {
    if (!this.mainResourceRegistry) return [];
    return this.mainResourceRegistry.getAllResources();
  }

  removeRegistries(registries: {
    toolRegistry: ToolRegistry;
    promptRegistry: PromptRegistry;
    resourceRegistry: ResourceRegistry;
  }): void {
    for (const client of this.clients.values()) {
      client.removeRegistries(registries);
    }
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
    await this.scheduleMcpContextRefresh();
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
          // eslint-disable-next-line @typescript-eslint/no-misused-spread
          ...config,
          extension,
        }),
      ),
    );
    await this.scheduleMcpContextRefresh();
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

  private async disconnectClient(clientKey: string, skipRefresh = false) {
    const existing = this.clients.get(clientKey);
    if (existing) {
      const serverName = existing.getServerName();
      try {
        this.clients.delete(clientKey);
        this.eventEmitter?.emit('mcp-client-update', this.clients);
        await existing.disconnect();
      } catch (error) {
        debugLogger.warn(
          `Error stopping client '${serverName}': ${getErrorMessage(error)}`,
        );
      } finally {
        if (!skipRefresh) {
          // This is required to update the content generator configuration with the
          // new tool configuration and system instructions.
          await this.scheduleMcpContextRefresh();
        }
      }
    }
  }

  private getClientKey(name: string, config: MCPServerConfig): string {
    const { extension, ...rest } = config;
    const keyData = {
      name,
      config: rest,
      extensionId: extension?.id,
    };
    return createHash('sha256').update(stableStringify(keyData)).digest('hex');
  }

  /**
   * Merges two MCP configurations. The second configuration (override)
   * takes precedence for scalar properties, but array properties are
   * merged securely (exclude = union, include = intersection) and
   * environment objects are merged.
   */
  private mergeMcpConfigs(
    base: MCPServerConfig,
    override: MCPServerConfig,
  ): MCPServerConfig {
    // For allowlists (includeTools), use intersection to ensure the most
    // restrictive policy wins. A tool must be allowed by BOTH parties.
    let includeTools: string[] | undefined;
    if (base.includeTools && override.includeTools) {
      includeTools = base.includeTools.filter((t) =>
        override.includeTools!.includes(t),
      );
      // If the intersection is empty, we must keep an empty array to indicate
      // that NO tools are allowed (undefined would allow everything).
    } else {
      // If only one provides an allowlist, use that.
      includeTools = override.includeTools ?? base.includeTools;
    }

    // For blocklists (excludeTools), use union so if ANY party blocks it,
    // it stays blocked.
    const excludeTools = [
      ...new Set([
        ...(base.excludeTools ?? []),
        ...(override.excludeTools ?? []),
      ]),
    ];

    const env = { ...(base.env ?? {}), ...(override.env ?? {}) };

    return {
      // eslint-disable-next-line @typescript-eslint/no-misused-spread
      ...base,
      // eslint-disable-next-line @typescript-eslint/no-misused-spread
      ...override,
      includeTools,
      excludeTools: excludeTools.length > 0 ? excludeTools : undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
      extension: override.extension ?? base.extension,
    };
  }

  async maybeDiscoverMcpServer(
    name: string,
    config: MCPServerConfig,
    registries?: {
      toolRegistry: ToolRegistry;
      promptRegistry: PromptRegistry;
      resourceRegistry: ResourceRegistry;
    },
  ): Promise<void> {
    const existingConfig = this.allServerConfigs.get(name);
    if (
      existingConfig?.extension?.id &&
      config.extension?.id &&
      existingConfig.extension.id !== config.extension.id
    ) {
      const extensionText = config.extension
        ? ` from extension "${config.extension.name}"`
        : '';
      debugLogger.warn(
        `Skipping MCP config for server with name "${name}"${extensionText} as it already exists.`,
      );
      return;
    }

    let finalConfig = config;
    if (existingConfig) {
      // If we're merging an extension config into a user config,
      // the user config should be the override.
      if (config.extension && !existingConfig.extension) {
        finalConfig = this.mergeMcpConfigs(config, existingConfig);
      } else {
        // Otherwise (User over Extension, or User over User),
        // the incoming config is the override.
        finalConfig = this.mergeMcpConfigs(existingConfig, config);
      }
    }

    // Always track server config for UI display
    this.allServerConfigs.set(name, finalConfig);

    const clientKey = this.getClientKey(name, finalConfig);

    // If no registries are provided (main agent) and a server with this name already exists
    // but with a different configuration, handle potential conflicts.
    if (!registries) {
      const existingSameName = Array.from(this.clients.values()).find(
        (c) => c.getServerName() === name,
      );
      if (existingSameName) {
        const existingConfigFromClient = existingSameName.getServerConfig();
        const existingKey = this.getClientKey(name, existingConfigFromClient);

        if (existingKey !== clientKey) {
          // This is a configuration update (hot-reload).
          // We should stop the old client before starting the new one.
          await this.disconnectClient(existingKey, true);
        }
      }
    }

    const existing = this.clients.get(clientKey);

    // If no connection details are provided, we can't discover this server.
    // This often happens when a user provides only overrides (like excludeTools)
    // for a server that is actually provided by an extension.
    if (!finalConfig.command && !finalConfig.url && !finalConfig.httpUrl) {
      return;
    }

    // Check if blocked by admin settings (allowlist/excludelist)
    if (this.isBlockedBySettings(name)) {
      if (!this.blockedMcpServers.find((s) => s.name === name)) {
        this.blockedMcpServers?.push({
          name,
          extensionName: finalConfig.extension?.name ?? '',
        });
      }
      return;
    }
    // User-disabled servers: disconnect if running, don't start
    if (await this.isDisabledByUser(name)) {
      if (existing) {
        await this.disconnectClient(clientKey);
      }
      return;
    }
    if (!this.cliConfig.isTrustedFolder()) {
      return;
    }
    if (finalConfig.extension && !finalConfig.extension.isActive) {
      return;
    }

    const currentDiscoveryPromise = new Promise<void>((resolve) => {
      void (async () => {
        try {
          let client = existing;
          if (!client) {
            client = new McpClient(
              name,
              finalConfig,
              this.cliConfig.getWorkspaceContext(),
              this.cliConfig,
              this.cliConfig.getDebugMode(),
              this.clientVersion,
              async () => {
                debugLogger.log(
                  `🔔 Refreshing context for server '${name}'...`,
                );
                await this.scheduleMcpContextRefresh();
              },
            );
            this.clients.set(clientKey, client);
            this.eventEmitter?.emit('mcp-client-update', this.clients);
          }

          const targetRegistries =
            registries ??
            (this.mainToolRegistry &&
            this.mainPromptRegistry &&
            this.mainResourceRegistry
              ? {
                  toolRegistry: this.mainToolRegistry,
                  promptRegistry: this.mainPromptRegistry,
                  resourceRegistry: this.mainResourceRegistry,
                }
              : undefined);

          try {
            if (client.getStatus() === MCPServerStatus.DISCONNECTED) {
              await client.connect();
            }
            if (targetRegistries) {
              await client.discoverInto(this.cliConfig, targetRegistries);
            }
            this.eventEmitter?.emit('mcp-client-update', this.clients);
          } catch (error) {
            this.eventEmitter?.emit('mcp-client-update', this.clients);
            // Check if this is a 401/auth error - if so, don't show as red error
            // (the info message was already shown in mcp-client.ts)
            if (!isAuthenticationError(error)) {
              // Log the error but don't let a single failed server stop the others
              const errorMessage = getErrorMessage(error);
              this.emitDiagnostic(
                'error',
                `Error during discovery for MCP server '${name}': ${errorMessage}`,
                error,
              );
            }
          }
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          this.emitDiagnostic(
            'error',
            `Fatal error ensuring MCP server '${name}' is connected: ${errorMessage}`,
            error,
          );
        } finally {
          resolve();
        }
      })();
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
      if (!this.discoveryPromise) {
        this.discoveryState = MCPDiscoveryState.COMPLETED;
        this.eventEmitter?.emit('mcp-client-update', this.clients);
      }
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
    if (
      this.discoveryState === MCPDiscoveryState.IN_PROGRESS &&
      !this.discoveryPromise
    ) {
      this.discoveryState = MCPDiscoveryState.COMPLETED;
      this.eventEmitter?.emit('mcp-client-update', this.clients);
    }

    await this.scheduleMcpContextRefresh();
  }

  /**
   * Restarts all MCP servers (including newly enabled ones).
   */
  async restart(): Promise<void> {
    const disconnectionPromises = Array.from(this.clients.keys()).map((key) =>
      this.disconnectClient(key, true),
    );
    await Promise.all(disconnectionPromises);

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
    await this.scheduleMcpContextRefresh();
  }

  /**
   * Restart a single MCP server by name.
   */
  async restartServer(name: string) {
    const config = this.allServerConfigs.get(name);
    if (!config) {
      throw new Error(`No MCP server registered with the name "${name}"`);
    }
    const clientKey = this.getClientKey(name, config);
    await this.disconnectClient(clientKey, true);
    await this.maybeDiscoverMcpServer(name, config);
    await this.scheduleMcpContextRefresh();
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
          this.emitDiagnostic(
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
    for (const client of this.clients.values()) {
      const serverName = client.getServerName();
      const clientInstructions = client.getInstructions();
      if (clientInstructions) {
        instructions.push(
          `The following are instructions provided by the tool server '${serverName}':\n---[start of server instructions]---\n${clientInstructions}\n---[end of server instructions]---`,
        );
      }
    }
    return instructions.join('\n\n');
  }

  private isRefreshingMcpContext: boolean = false;
  private pendingMcpContextRefresh: boolean = false;

  private async scheduleMcpContextRefresh(): Promise<void> {
    this.pendingMcpContextRefresh = true;

    if (this.isRefreshingMcpContext) {
      debugLogger.log(
        'MCP context refresh already in progress, queuing trailing execution.',
      );
      return this.pendingRefreshPromise ?? Promise.resolve();
    }

    if (this.pendingRefreshPromise) {
      debugLogger.log(
        'MCP context refresh already scheduled, coalescing with existing request.',
      );
      return this.pendingRefreshPromise;
    }

    debugLogger.log('Scheduling MCP context refresh...');
    this.pendingRefreshPromise = (async () => {
      this.isRefreshingMcpContext = true;
      try {
        do {
          this.pendingMcpContextRefresh = false;
          debugLogger.log('Executing MCP context refresh...');
          await this.cliConfig.refreshMcpContext();
          debugLogger.log('MCP context refresh complete.');

          // If more refresh requests came in during the execution, wait a bit
          // to coalesce them before the next iteration.
          if (this.pendingMcpContextRefresh) {
            debugLogger.log(
              'Coalescing burst refresh requests (300ms delay)...',
            );
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        } while (this.pendingMcpContextRefresh);
      } catch (error) {
        debugLogger.error(
          `Error refreshing MCP context: ${getErrorMessage(error)}`,
        );
      } finally {
        this.isRefreshingMcpContext = false;
        this.pendingRefreshPromise = null;
      }
    })();

    return this.pendingRefreshPromise;
  }

  getMcpServerCount(): number {
    return this.clients.size;
  }
}
