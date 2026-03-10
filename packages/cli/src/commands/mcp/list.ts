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
  type GeminiCLIExtension,
  type MCPServerConfig,
} from '@google/gemini-cli-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ExtensionManager } from '../../config/extension-manager.js';
import {
  canLoadServer,
  McpServerEnablementManager,
} from '../../config/mcp/index.js';
import { loadCliConfig, type CliArgs } from '../../config/config.js';
import { exitCli } from '../utils.js';
import chalk from 'chalk';

export async function getMcpServersFromConfig(
  settings: MergedSettings,
  extensionManager: ExtensionManager,
): Promise<{
  mcpServers: Record<string, MCPServerConfig>;
  blockedServerNames: string[];
}> {
  let extensions: GeminiCLIExtension[];
  try {
    extensions = extensionManager.getExtensions();
  } catch {
    extensions = await extensionManager.loadExtensions();
  }
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
  isTrusted: boolean,
  activeSettings: MergedSettings,
): Promise<MCPServerStatus> {
  // SECURITY: Only test connection if workspace is trusted or if it's a remote server.
  // stdio servers execute local commands and must never run in untrusted workspaces.
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
    isTrustedFolder: () => isTrusted,
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
  isTrusted: boolean,
  activeSettings: MergedSettings,
): Promise<MCPServerStatus> {
  const mcpEnablementManager = McpServerEnablementManager.getInstance();
  const loadResult = await canLoadServer(serverName, {
    adminMcpEnabled: activeSettings.admin?.mcp?.enabled ?? true,
    allowedList: activeSettings.mcp?.allowed,
    excludedList: activeSettings.mcp?.excluded,
    enablement: mcpEnablementManager.getEnablementCallbacks(),
  });

  if (!loadResult.allowed) {
    if (
      loadResult.blockType === 'admin' ||
      loadResult.blockType === 'allowlist' ||
      loadResult.blockType === 'excludelist'
    ) {
      return MCPServerStatus.BLOCKED;
    }
    return MCPServerStatus.DISABLED;
  }

  // Test all server types by attempting actual connection
  return testMCPConnection(serverName, server, isTrusted, activeSettings);
}

export async function listMcpServers(
  argv: CliArgs,
  loadedSettingsArg?: LoadedSettings,
): Promise<void> {
  const loadedSettings = loadedSettingsArg ?? loadSettings();
  const activeSettings = loadedSettings.merged;

  const config = await loadCliConfig(activeSettings, 'mcp-list-session', argv, {
    cwd: process.cwd(),
  });
  await config.initialize();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const extensionManager = config.getExtensionLoader() as ExtensionManager;

  const { mcpServers, blockedServerNames } = await getMcpServersFromConfig(
    activeSettings,
    extensionManager,
  );
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

    const status = await getServerStatus(
      serverName,
      server,
      loadedSettings.isTrusted,
      activeSettings,
    );

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
  loadedSettings?: LoadedSettings;
}

export const listCommand: CommandModule<object, ListArgs> = {
  command: 'list',
  describe: 'List all configured MCP servers',
  handler: async (argv) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    await listMcpServers(argv as unknown as CliArgs, argv.loadedSettings);
    await exitCli();
  },
};
