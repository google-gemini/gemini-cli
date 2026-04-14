/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// File for 'gemini mcp list' command
import type { CommandModule } from 'yargs';
import {
  type MergedSettings,
  loadSettings,
  type LoadedSettings,
} from '../../config/settings.js';
import {
  MCPServerStatus,
  createTransport,
  debugLogger,
  applyAdminAllowlist,
  getAdminBlockedMcpServersMessage,
} from '@google/gemini-cli-core';
import type { MCPServerConfig } from '@google/gemini-cli-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ExtensionManager } from '../../config/extension-manager.js';
import {
  canLoadServer,
  McpServerEnablementManager,
} from '../../config/mcp/index.js';
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
      if (mcpServers[key]) return;

      mcpServers[key] = {
        // eslint-disable-next-line @typescript-eslint/no-misused-spread
        ...server,
        extension,
      };
    });
  }

  const adminAllowlist = settings.admin?.mcp?.config;
  return applyAdminAllowlist(mcpServers, adminAllowlist);
}

async function testMCPConnection(
  serverName: string,
  config: MCPServerConfig,
  isTrusted: boolean,
  activeSettings: MergedSettings,
): Promise<MCPServerStatus> {
  const isStdio = !!config.command;

  if (isStdio && !isTrusted) {
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
      blockedEnvironmentVariables: activeSettings.advanced.excludedEnvVars,
    },
    emitMcpDiagnostic: (
      severity: 'info' | 'warning' | 'error',
      message: string,
      error?: unknown,
      serverName?: string,
    ) => {
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
    isTrustedFolder: () => isTrusted,
  };

  let transport;
  try {
    transport = await createTransport(serverName, config, false, mcpContext);
  } catch {
    await client.close();
    return MCPServerStatus.DISCONNECTED;
  }

  try {
    await client.connect(transport, { timeout: 5000 });
    await client.ping();

    await client.close();
    return MCPServerStatus.CONNECTED;
  } catch {
    await transport.close();
    return MCPServerStatus.DISCONNECTED;
  }
}

export async function listMcpServers(
  loadedSettingsArg?: LoadedSettings,
  checkConnections = false,
): Promise<void> {
  const loadedSettings = loadedSettingsArg ?? loadSettings();
  const activeSettings = loadedSettings.merged;

  const { mcpServers, blockedServerNames } =
    await getMcpServersFromConfig(activeSettings);

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

  // ✅ Optimization: compute once
  const enablementCallbacks =
    McpServerEnablementManager.getInstance().getEnablementCallbacks();

  for (const serverName of serverNames) {
    const server = mcpServers[serverName];

    let status: MCPServerStatus;

    // ✅ Always perform local checks (fast)
    const loadResult = await canLoadServer(serverName, {
      adminMcpEnabled: activeSettings.admin?.mcp?.enabled ?? true,
      allowedList: activeSettings.mcp?.allowed,
      excludedList: activeSettings.mcp?.excluded,
      enablement: enablementCallbacks,
    });

    if (!loadResult.allowed) {
      if (
        loadResult.blockType === 'admin' ||
        loadResult.blockType === 'allowlist' ||
        loadResult.blockType === 'excludelist'
      ) {
        status = MCPServerStatus.BLOCKED;
      } else {
        status = MCPServerStatus.DISABLED;
      }
    } else if (checkConnections) {
      // ✅ Only slow check when explicitly requested
      status = await testMCPConnection(
        serverName,
        server,
        loadedSettings.isTrusted,
        activeSettings,
      );
    } else {
      status = MCPServerStatus.DISCONNECTED;
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

    if (checkConnections) {
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
        case MCPServerStatus.BLOCKED:
          statusIndicator = chalk.red('⛔');
          statusText = 'Blocked';
          break;
        case MCPServerStatus.DISABLED:
          statusIndicator = chalk.gray('○');
          statusText = 'Disabled';
          break;
        case MCPServerStatus.DISCONNECTED:
        default:
          statusIndicator = chalk.red('✗');
          statusText = 'Disconnected';
          break;
      }

      debugLogger.log(`${statusIndicator} ${serverInfo} - ${statusText}`);
    } else {
      debugLogger.log(`• ${serverInfo}`);
    }
  }
}

interface ListArgs {
  check?: boolean;
}

export const listCommand: CommandModule<object, ListArgs> = {
  command: 'list',
  describe: 'List all configured MCP servers',
  builder: (yargs) =>
    yargs.option('check', {
      type: 'boolean',
      default: false,
      describe: 'Test connection to each MCP server',
    }),
  handler: async (argv) => {
    await listMcpServers(undefined, argv.check);
    await exitCli();
  },
};
