/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MCPServerConfig } from '../../config/config.js';

/**
 * Applies the admin allowlist to the local MCP servers.
 *
 * If an admin allowlist is provided and not empty, this function filters the
 * local servers to only those present in the allowlist. It also overrides
 * connection details (url, type, trust) with the admin configuration and
 * removes local execution details (command, args, env, cwd).
 *
 * @param localMcpServers The locally configured MCP servers.
 * @param adminAllowlist The admin allowlist configuration.
 * @returns The filtered and merged MCP servers.
 */
export function applyAdminAllowlist(
  localMcpServers: Record<string, MCPServerConfig>,
  adminAllowlist: Record<string, MCPServerConfig> | undefined,
): {
  mcpServers: Record<string, MCPServerConfig>;
  blockedServerNames: string[];
} {
  if (!adminAllowlist || Object.keys(adminAllowlist).length === 0) {
    return { mcpServers: localMcpServers, blockedServerNames: [] };
  }

  const filteredMcpServers: Record<string, MCPServerConfig> = {};
  const blockedServerNames: string[] = [];

  for (const [serverId, localConfig] of Object.entries(localMcpServers)) {
    const adminConfig = adminAllowlist[serverId];
    if (adminConfig) {
      const mergedConfig = {
        ...localConfig,
        url: adminConfig.url,
        type: adminConfig.type,
        trust: adminConfig.trust,
      };

      // Remove local connection details
      delete mergedConfig.command;
      delete mergedConfig.args;
      delete mergedConfig.env;
      delete mergedConfig.cwd;
      delete mergedConfig.httpUrl;
      delete mergedConfig.tcp;

      if (
        (adminConfig.includeTools && adminConfig.includeTools.length > 0) ||
        (adminConfig.excludeTools && adminConfig.excludeTools.length > 0)
      ) {
        mergedConfig.includeTools = adminConfig.includeTools;
        mergedConfig.excludeTools = adminConfig.excludeTools;
      }

      filteredMcpServers[serverId] = mergedConfig;
    } else {
      blockedServerNames.push(serverId);
    }
  }
  return { mcpServers: filteredMcpServers, blockedServerNames };
}
