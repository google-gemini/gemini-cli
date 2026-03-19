/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MCPServerConfig } from '../../config/config.js';
import type { RequiredMcpServerConfig } from '../types.js';

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

/**
 * Applies admin-required MCP servers by injecting them into the MCP server
 * list. Required servers always take precedence over locally configured servers
 * with the same name and cannot be disabled by the user.
 *
 * @param mcpServers The current MCP servers (after allowlist filtering).
 * @param requiredServers The admin-required MCP server configurations.
 * @returns The MCP servers with required servers injected, and the list of
 *   required server names for informational purposes.
 */
export function applyRequiredServers(
  mcpServers: Record<string, MCPServerConfig>,
  requiredServers: Record<string, RequiredMcpServerConfig> | undefined,
): {
  mcpServers: Record<string, MCPServerConfig>;
  requiredServerNames: string[];
} {
  if (!requiredServers || Object.keys(requiredServers).length === 0) {
    return { mcpServers, requiredServerNames: [] };
  }

  const result: Record<string, MCPServerConfig> = { ...mcpServers };
  const requiredServerNames: string[] = [];

  for (const [serverId, requiredConfig] of Object.entries(requiredServers)) {
    requiredServerNames.push(serverId);

    // Convert RequiredMcpServerConfig to MCPServerConfig.
    // Required servers completely override any local config with the same name.
    result[serverId] = new MCPServerConfig(
      undefined, // command (stdio not supported for required servers)
      undefined, // args
      undefined, // env
      undefined, // cwd
      requiredConfig.url, // url
      undefined, // httpUrl (use url + type instead)
      requiredConfig.headers, // headers
      undefined, // tcp
      requiredConfig.type, // type
      requiredConfig.timeout, // timeout
      requiredConfig.trust ?? true, // trust defaults to true for admin-forced
      requiredConfig.description, // description
      requiredConfig.includeTools, // includeTools
      requiredConfig.excludeTools, // excludeTools
      undefined, // extension
      requiredConfig.oauth, // oauth
      requiredConfig.authProviderType, // authProviderType
      requiredConfig.targetAudience, // targetAudience
      requiredConfig.targetServiceAccount, // targetServiceAccount
    );
  }

  return { mcpServers: result, requiredServerNames };
}
