/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// File for 'gemini mcp list' command
import type { CommandModule } from 'yargs';
import { type MergedSettings, loadSettings } from '../../config/settings.js';
import type { MCPServerConfig } from '@google/gemini-cli-core';
import {
  MCPServerStatus,
  createTransport,
  debugLogger,
  applyAdminAllowlist,
  getAdminBlockedMcpServersMessage,
} from '@google/gemini-cli-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import { requestConsentNonInteractive } from '../../config/extensions/consent.js';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';
import { exitCli } from '../utils.js';
import chalk from 'chalk';

export async function getMcpServersFromConfig(
  settings?: MergedSettings,
): Promise<{
  mcpServers: Record<string, MCPServerConfig>;
  blockedServerNames: string[];
}> {
  if (!settings) {
    settings = loadSettings().merged;
  }

  const extensionManager = new ExtensionManager({
    settings,
    workspaceDir: process.cwd(),
    requestConsent: requestConsentNonInteractive,
    requestSetting: promptForSetting,
  });
  const extensions = await extensionManager.loadExtensions();
  const mcpServers = { ...settings.mcpServers };
  for (const extension of extensions) {
    Object.entries(extension.mcpServers || {}).forEach(([key, server]) => {
      if (mcpServers[key]) {
        return;
      }
      mcpServers[key] = {
        ...server,
        extension,
      };
    });
  }

  const adminAllowlist = settings.admin?.mcp?.config;
  const filteredResult = applyAdminAllowlist(mcpServers, adminAllowlist);

  return filteredResult;
}

async function testMCPConnection(
  serverName: string,
  config: MCPServerConfig,
): Promise<MCPServerStatus> {
  const settings = loadSettings();

  // SECURITY: Only test connection if workspace is trusted or if it's a remote server.
  // stdio servers execute local commands and must never run in untrusted workspaces.
  const isStdio = !!config.command;
  if (isStdio && !settings.isTrusted) {
    return MCPServerStatus.DISCONNECTED;
  }

  const client = new Client({
    name: 'mcp-test-client',
    version: '0.0.1',
  });

  const mcpContext = {
    sanitizationConfig: {
      enableEnvironmentVariableRedaction: true,
      allowedEnvironmentVariables: [],
      blockedEnvironmentVariables: settings.merged.advanced.excludedEnvVars,
    },
    emitMcpDiagnostic: (
      severity: 'info' | 'warning' | 'error',
      message: string,
      error?: unknown,
      serverName?: string,
    ) => {
      // In non-interactive list, we log everything through debugLogger for consistency
      if (severity === 'error') {
        debugLogger.error(
          chalk.red(`Error${serverName ? ` (${serverName})` : ''}: ${message}`),
          error,
        );
      } else if (severity === 'warning') {
        debugLogger.warn(
          chalk.yellow(
            `Warning${serverName ? ` (${serverName})` : ''}: ${message}`,
          ),
          error,
        );
      } else {
        debugLogger.log(message, error);
      }
    },
    isTrustedFolder: () => settings.isTrusted,
  };

  let transport;
  try {
    // Use the same transport creation logic as core
    transport = await createTransport(serverName, config, false, mcpContext);
  } catch (_error) {
    await client.close();
    return MCPServerStatus.DISCONNECTED;
  }

  try {
    // Attempt actual MCP connection with short timeout
    await client.connect(transport, { timeout: 5000 }); // 5s timeout

    // Test basic MCP protocol by pinging the server
    await client.ping();

    await client.close();
    return MCPServerStatus.CONNECTED;
  } catch (_error) {
    await transport.close();
    return MCPServerStatus.DISCONNECTED;
  }
}

async function getServerStatus(
  serverName: string,
  server: MCPServerConfig,
): Promise<MCPServerStatus> {
  // Test all server types by attempting actual connection
  return testMCPConnection(serverName, server);
}

export async function listMcpServers(settings?: MergedSettings): Promise<void> {
  const { mcpServers, blockedServerNames } =
    await getMcpServersFromConfig(settings);
  const serverNames = Object.keys(mcpServers);

  if (blockedServerNames.length > 0) {
    const message = getAdminBlockedMcpServersMessage(
      blockedServerNames,
      undefined,
    );
    debugLogger.log(chalk.yellow(message + '\n'));
  }

  if (serverNames.length === 0) {
    if (blockedServerNames.length === 0) {
      debugLogger.log('No MCP servers configured.');
    }
    return;
  }

  debugLogger.log('Configured MCP servers:\n');

  for (const serverName of serverNames) {
    const server = mcpServers[serverName];

    const status = await getServerStatus(serverName, server);

    let statusIndicator = '';
    let statusText = '';
    switch (status) {
      case MCPServerStatus.CONNECTED:
        statusIndicator = chalk.green('✓');
        statusText = 'Connected';
        break;
      case MCPServerStatus.CONNECTING:
        statusIndicator = chalk.yellow('…');
        statusText = 'Connecting';
        break;
      case MCPServerStatus.DISCONNECTED:
      default:
        statusIndicator = chalk.red('✗');
        statusText = 'Disconnected';
        break;
    }

    let serverInfo =
      serverName +
      (server.extension?.name ? ` (from ${server.extension.name})` : '') +
      ': ';
    if (server.httpUrl) {
      serverInfo += `${server.httpUrl} (http)`;
    } else if (server.url) {
      const type = server.type || 'http';
      serverInfo += `${server.url} (${type})`;
    } else if (server.command) {
      serverInfo += `${server.command} ${server.args?.join(' ') || ''} (stdio)`;
    }

    debugLogger.log(`${statusIndicator} ${serverInfo} - ${statusText}`);
  }
}

interface ListArgs {
  settings?: MergedSettings;
}

export const listCommand: CommandModule<object, ListArgs> = {
  command: 'list',
  describe: 'List all configured MCP servers',
  handler: async (argv) => {
    await listMcpServers(argv.settings);
    await exitCli();
  },
};
