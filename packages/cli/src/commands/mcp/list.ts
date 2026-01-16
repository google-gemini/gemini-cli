/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// File for 'gemini mcp list' command
import type { CommandModule } from 'yargs';
import { loadSettings } from '../../config/settings.js';
import type { MCPServerConfig } from '@google/gemini-cli-core';
import {
  MCPServerStatus,
  createTransport,
  debugLogger,
} from '@google/gemini-cli-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import { requestConsentNonInteractive } from '../../config/extensions/consent.js';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';
import { exitCli } from '../utils.js';

const COLOR_GREEN = '\u001b[32m';
const COLOR_YELLOW = '\u001b[33m';
const COLOR_RED = '\u001b[31m';
const RESET_COLOR = '\u001b[0m';

async function getMcpServersFromConfig(): Promise<
  Record<string, MCPServerConfig>
> {
  const settings = loadSettings();
  const extensionManager = new ExtensionManager({
    settings: settings.merged,
    workspaceDir: process.cwd(),
    requestConsent: requestConsentNonInteractive,
    requestSetting: promptForSetting,
  });
  const extensions = await extensionManager.loadExtensions();
  const mcpServers = { ...settings.merged.mcpServers };
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
  return mcpServers;
}

async function testMCPConnection(
  serverName: string,
  config: MCPServerConfig,
): Promise<MCPServerStatus> {
  const client = new Client({
    name: 'mcp-test-client',
    version: '0.0.1',
  });

  const settings = loadSettings();
  const sanitizationConfig = {
    enableEnvironmentVariableRedaction: true,
    allowedEnvironmentVariables: [],
    blockedEnvironmentVariables: settings.merged.advanced.excludedEnvVars,
  };

  let transport;
  try {
    // Use the same transport creation logic as core
    transport = await createTransport(
      serverName,
      config,
      false,
      sanitizationConfig,
    );
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

export async function listMcpServers(): Promise<void> {
  const mcpServers = await getMcpServersFromConfig();
  const serverNames = Object.keys(mcpServers);

  if (serverNames.length === 0) {
    debugLogger.log('No MCP servers configured.');
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
        statusIndicator = COLOR_GREEN + '✓' + RESET_COLOR;
        statusText = 'Connected';
        break;
      case MCPServerStatus.CONNECTING:
        statusIndicator = COLOR_YELLOW + '…' + RESET_COLOR;
        statusText = 'Connecting';
        break;
      case MCPServerStatus.DISCONNECTED:
      default:
        statusIndicator = COLOR_RED + '✗' + RESET_COLOR;
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
      serverInfo += `${server.url} (sse)`;
    } else if (server.command) {
      serverInfo += `${server.command} ${server.args?.join(' ') || ''} (stdio)`;
    }

    debugLogger.log(`${statusIndicator} ${serverInfo} - ${statusText}`);
  }
}

export const listCommand: CommandModule = {
  command: 'list',
  describe: 'List all configured MCP servers',
  handler: async () => {
    await listMcpServers();
    await exitCli();
  },
};
