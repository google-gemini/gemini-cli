/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Storage, coreEvents } from '@google/gemini-cli-core';

/**
 * Stored in JSON file - represents persistent enablement state.
 */
export interface McpServerEnablementState {
  enabled: boolean;
}

/**
 * File config format - map of server ID to enablement state.
 */
export interface McpServerEnablementConfig {
  [serverId: string]: McpServerEnablementState;
}

/**
 * For UI display - combines file and session state.
 */
export interface McpServerDisplayState {
  /** Effective state (considering session override) */
  enabled: boolean;
  /** True if disabled via --session flag */
  isSessionDisabled: boolean;
  /** True if disabled in file */
  isPersistentDisabled: boolean;
}

/**
 * Callback types for enablement checks (passed from CLI to core).
 */
export interface EnablementCallbacks {
  isSessionDisabled: (serverId: string) => boolean;
  isFileEnabled: (serverId: string) => Promise<boolean>;
  /**
   * Whether the persistent config file could be read. Lets callers give a
   * distinct reason when enablement state is unknown, instead of reporting
   * the server as user-disabled.
   */
  isConfigReadable?: () => Promise<boolean>;
}

/**
 * Result of canLoadServer check.
 */
export interface ServerLoadResult {
  allowed: boolean;
  reason?: string;
  blockType?: 'admin' | 'allowlist' | 'excludelist' | 'session' | 'enablement';
}

/**
 * Normalize a server ID to canonical lowercase form.
 */
export function normalizeServerId(serverId: string): string {
  return serverId.toLowerCase().trim();
}

/**
 * Check if a server ID is in a settings list (with backward compatibility).
 * Handles case-insensitive matching and plain name fallback for ext: servers.
 */
export function isInSettingsList(
  serverId: string,
  list: string[],
): { found: boolean; deprecationWarning?: string } {
  const normalizedId = normalizeServerId(serverId);
  const normalizedList = list.map(normalizeServerId);

  // Exact canonical match
  if (normalizedList.includes(normalizedId)) {
    return { found: true };
  }

  // Backward compat: for ext: servers, check if plain name matches
  if (normalizedId.startsWith('ext:')) {
    const plainName = normalizedId.split(':').pop();
    if (plainName && normalizedList.includes(plainName)) {
      return {
        found: true,
        deprecationWarning:
          `Settings reference '${plainName}' matches extension server '${serverId}'. ` +
          `Update your settings to use the full identifier '${serverId}' instead.`,
      };
    }
  }

  return { found: false };
}

/**
 * Single source of truth for whether a server can be loaded.
 * Used by: isAllowedMcpServer(), connectServer(), CLI handlers, slash handlers.
 *
 * Uses callbacks instead of direct enablementManager reference to keep
 * packages/core independent of packages/cli.
 */
export async function canLoadServer(
  serverId: string,
  config: {
    adminMcpEnabled: boolean;
    allowedList?: string[];
    excludedList?: string[];
    enablement?: EnablementCallbacks;
  },
): Promise<ServerLoadResult> {
  const normalizedId = normalizeServerId(serverId);

  // 1. Admin kill switch
  if (!config.adminMcpEnabled) {
    return {
      allowed: false,
      reason:
        'MCP servers are disabled by administrator. Check admin settings or contact your admin.',
      blockType: 'admin',
    };
  }

  // 2. Allowlist check
  if (config.allowedList !== undefined) {
    const { found, deprecationWarning } = isInSettingsList(
      normalizedId,
      config.allowedList,
    );
    if (deprecationWarning) {
      coreEvents.emitFeedback('warning', deprecationWarning);
    }
    if (!found) {
      return {
        allowed: false,
        reason: `Server '${serverId}' is not in mcp.allowed list. Add it to settings.json mcp.allowed array to enable.`,
        blockType: 'allowlist',
      };
    }
  }

  // 3. Excludelist check
  if (config.excludedList) {
    const { found, deprecationWarning } = isInSettingsList(
      normalizedId,
      config.excludedList,
    );
    if (deprecationWarning) {
      coreEvents.emitFeedback('warning', deprecationWarning);
    }
    if (found) {
      return {
        allowed: false,
        reason: `Server '${serverId}' is blocked by mcp.excluded. Remove it from settings.json mcp.excluded array to enable.`,
        blockType: 'excludelist',
      };
    }
  }

  // 4. Session disable check (before file-based enablement)
  if (config.enablement?.isSessionDisabled(normalizedId)) {
    return {
      allowed: false,
      reason: `Server '${serverId}' is disabled for this session. Run 'gemini mcp enable ${serverId} --session' to clear.`,
      blockType: 'session',
    };
  }

  // 5. File-based enablement check
  if (
    config.enablement &&
    !(await config.enablement.isFileEnabled(normalizedId))
  ) {
    const configReadable = config.enablement.isConfigReadable
      ? await config.enablement.isConfigReadable()
      : true;
    return {
      allowed: false,
      reason: configReadable
        ? `Server '${serverId}' is disabled. Run 'gemini mcp enable ${serverId}' to enable.`
        : `Server '${serverId}' enablement state is unknown because its config file could not be read.`,
      blockType: 'enablement',
    };
  }

  return { allowed: true };
}

const MCP_ENABLEMENT_FILENAME = 'mcp-server-enablement.json';

/**
 * McpServerEnablementManager
 *
 * Manages the enabled/disabled state of MCP servers.
 * Uses a simplified format compared to ExtensionEnablementManager.
 * Supports both persistent (file) and session-only (in-memory) states.
 *
 * NOTE: Use getInstance() to get the singleton instance. This ensures
 * session state (sessionDisabled Set) is shared across all code paths.
 */
export class McpServerEnablementManager {
  private static instance: McpServerEnablementManager | null = null;

  private readonly configFilePath: string;
  private readonly configDir: string;
  private readonly sessionDisabled = new Set<string>();

  /**
   * Get the singleton instance.
   */
  static getInstance(): McpServerEnablementManager {
    if (!McpServerEnablementManager.instance) {
      McpServerEnablementManager.instance = new McpServerEnablementManager();
    }
    return McpServerEnablementManager.instance;
  }

  /**
   * Reset the singleton instance (for testing only).
   */
  static resetInstance(): void {
    McpServerEnablementManager.instance = null;
  }

  constructor() {
    this.configDir = Storage.getGlobalGeminiDir();
    this.configFilePath = path.join(this.configDir, MCP_ENABLEMENT_FILENAME);
  }

  /**
   * Check if server is enabled in FILE (persistent config only).
   * Does NOT include session state.
   */
  async isFileEnabled(serverName: string): Promise<boolean> {
    const config = await this.readConfig();
    if (config === undefined) {
      // Fail closed: a config we couldn't parse is not the same as an
      // empty one. Treating it as empty would silently re-enable every
      // server the user had disabled.
      return false;
    }
    const state = config[normalizeServerId(serverName)];
    return state?.enabled ?? true;
  }

  /**
   * Whether the persistent config file can currently be read. Used to
   * distinguish "server is disabled" from "enablement state is unknown".
   */
  async isConfigReadable(): Promise<boolean> {
    return (await this.readConfig()) !== undefined;
  }

  /**
   * Check if server is session-disabled.
   */
  isSessionDisabled(serverName: string): boolean {
    return this.sessionDisabled.has(normalizeServerId(serverName));
  }

  /**
   * Check effective enabled state (combines file + session).
   * Convenience method; canLoadServer() uses separate callbacks for granular blockType.
   */
  async isEffectivelyEnabled(serverName: string): Promise<boolean> {
    if (this.isSessionDisabled(serverName)) {
      return false;
    }
    return this.isFileEnabled(serverName);
  }

  /**
   * Enable a server persistently.
   * Removes the server from config file (defaults to enabled).
   */
  async enable(serverName: string): Promise<void> {
    const normalizedName = normalizeServerId(serverName);
    const config = await this.readConfig();
    if (config === undefined) {
      // Don't write while the existing file can't be read; that would
      // overwrite whatever state it currently holds. Throw instead of
      // silently no-op'ing, so callers don't report success.
      throw new Error(
        `Cannot enable '${serverName}': the MCP server enablement config at ${this.configFilePath} could not be read.`,
      );
    }

    if (normalizedName in config) {
      delete config[normalizedName];
      await this.writeConfig(config);
    }
  }

  /**
   * Disable a server persistently.
   * Adds server to config file with enabled: false.
   */
  async disable(serverName: string): Promise<void> {
    const config = await this.readConfig();
    if (config === undefined) {
      // Don't write while the existing file can't be read; that would
      // overwrite whatever state it currently holds. Throw instead of
      // silently no-op'ing, so callers don't report success.
      throw new Error(
        `Cannot disable '${serverName}': the MCP server enablement config at ${this.configFilePath} could not be read.`,
      );
    }
    config[normalizeServerId(serverName)] = { enabled: false };
    await this.writeConfig(config);
  }

  /**
   * Disable a server for current session only (in-memory).
   */
  disableForSession(serverName: string): void {
    this.sessionDisabled.add(normalizeServerId(serverName));
  }

  /**
   * Clear session disable for a server.
   */
  clearSessionDisable(serverName: string): void {
    this.sessionDisabled.delete(normalizeServerId(serverName));
  }

  /**
   * Get display state for a specific server (for UI).
   */
  async getDisplayState(serverName: string): Promise<McpServerDisplayState> {
    const isSessionDisabled = this.isSessionDisabled(serverName);
    const isPersistentDisabled = !(await this.isFileEnabled(serverName));

    return {
      enabled: !isSessionDisabled && !isPersistentDisabled,
      isSessionDisabled,
      isPersistentDisabled,
    };
  }

  /**
   * Get all display states (for UI listing).
   */
  async getAllDisplayStates(
    serverIds: string[],
  ): Promise<Record<string, McpServerDisplayState>> {
    const result: Record<string, McpServerDisplayState> = {};
    for (const serverId of serverIds) {
      result[normalizeServerId(serverId)] =
        await this.getDisplayState(serverId);
    }
    return result;
  }

  /**
   * Get enablement callbacks for passing to core.
   */
  getEnablementCallbacks(): EnablementCallbacks {
    return {
      isSessionDisabled: (id) => this.isSessionDisabled(id),
      isFileEnabled: (id) => this.isFileEnabled(id),
      isConfigReadable: () => this.isConfigReadable(),
    };
  }

  /**
   * Auto-enable any disabled MCP servers by name.
   * Returns server names that were actually re-enabled.
   */
  async autoEnableServers(serverNames: string[]): Promise<string[]> {
    const enabledServers: string[] = [];

    for (const serverName of serverNames) {
      const normalizedName = normalizeServerId(serverName);
      const state = await this.getDisplayState(normalizedName);

      let wasDisabled = false;
      if (state.isPersistentDisabled) {
        await this.enable(normalizedName);
        wasDisabled = true;
      }
      if (state.isSessionDisabled) {
        this.clearSessionDisable(normalizedName);
        wasDisabled = true;
      }

      if (wasDisabled) {
        enabledServers.push(serverName);
      }
    }

    return enabledServers;
  }

  /**
   * Read config from file asynchronously.
   *
   * Returns `undefined` (rather than `{}`) when the file exists but could
   * not be read or parsed, so callers can distinguish "no config yet" from
   * "config is corrupted" instead of treating the latter as the former.
   */
  private async readConfig(): Promise<McpServerEnablementConfig | undefined> {
    try {
      const content = await fs.readFile(this.configFilePath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return JSON.parse(content) as McpServerEnablementConfig;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return {};
      }
      coreEvents.emitFeedback(
        'error',
        'Failed to read MCP server enablement config.',
        error,
      );
      return undefined;
    }
  }

  /**
   * Write config to file asynchronously.
   */
  private async writeConfig(config: McpServerEnablementConfig): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    await fs.writeFile(this.configFilePath, JSON.stringify(config, null, 2));
  }
}
