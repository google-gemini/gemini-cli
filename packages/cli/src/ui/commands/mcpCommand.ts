/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SlashCommand,
  SlashCommandActionReturn,
  CommandContext,
} from './types.js';
import { CommandKind } from './types.js';
import type { MessageActionReturn } from '@google/gemini-cli-core';
import {
  DiscoveredMCPTool,
  getMCPDiscoveryState,
  getMCPServerStatus,
  MCPDiscoveryState,
  MCPServerStatus,
  getErrorMessage,
  MCPOAuthTokenStorage,
  mcpServerRequiresOAuth,
  CoreEvent,
  coreEvents,
} from '@google/gemini-cli-core';

import { MessageType, type HistoryItemMcpStatus } from '../types.js';
import {
  McpServerEnablementManager,
  normalizeServerId,
  canLoadServer,
} from '../../config/mcp/mcpServerEnablement.js';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { parseSlashCommand } from '../../utils/commands.js';

const authCommand: SlashCommand = {
  name: 'auth',
  description: 'Authenticate with an OAuth-enabled MCP server',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<MessageActionReturn> => {
    const serverName = args.trim();
    const agentContext = context.services.agentContext;
    const config = agentContext?.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      };
    }

    config.setUserInteractedWithMcp();

    const mcpServers = config.getMcpClientManager()?.getMcpServers() ?? {};

    if (!serverName) {
      // List servers that support OAuth from two sources:
      // 1. Servers with oauth.enabled in config
      // 2. Servers detected as requiring OAuth (returned 401)
      const configuredOAuthServers = Object.entries(mcpServers)
        .filter(([_, server]) => server.oauth?.enabled)
        .map(([name, _]) => name);

      const detectedOAuthServers = Array.from(
        mcpServerRequiresOAuth.keys(),
      ).filter((name) => mcpServers[name]); // Only include configured servers

      // Combine and deduplicate
      const allOAuthServers = [
        ...new Set([...configuredOAuthServers, ...detectedOAuthServers]),
      ];

      if (allOAuthServers.length === 0) {
        return {
          type: 'message',
          messageType: 'info',
          content: 'No MCP servers configured with OAuth authentication.',
        };
      }

      return {
        type: 'message',
        messageType: 'info',
        content: `MCP servers with OAuth authentication:\n${allOAuthServers.map((s) => `  - ${s}`).join('\n')}\n\nUse /mcp auth <server-name> to authenticate.`,
      };
    }

    const server = mcpServers[serverName];
    if (!server) {
      return {
        type: 'message',
        messageType: 'error',
        content: `MCP server '${serverName}' not found.`,
      };
    }

    // Always attempt OAuth authentication, even if not explicitly configured
    // The authentication process will discover OAuth requirements automatically

    const displayListener = (message: string) => {
      context.ui.addItem({ type: 'info', text: message });
    };

    coreEvents.on(CoreEvent.OauthDisplayMessage, displayListener);
    try {
      context.ui.addItem({
        type: 'info',
        text: `Starting OAuth authentication for MCP server '${serverName}'...`,
      });

      // Import dynamically to avoid circular dependencies
      const { MCPOAuthProvider } = await import('@google/gemini-cli-core');

      let oauthConfig = server.oauth;
      if (!oauthConfig) {
        oauthConfig = { enabled: false };
      }

      const mcpServerUrl = server.httpUrl || server.url;
      const authProvider = new MCPOAuthProvider(new MCPOAuthTokenStorage());
      await authProvider.authenticate(serverName, oauthConfig, mcpServerUrl);

      context.ui.addItem({
        type: 'info',
        text: `✅ Successfully authenticated with MCP server '${serverName}'!`,
      });

      // Trigger tool re-discovery to pick up authenticated server
      const mcpClientManager = config.getMcpClientManager();
      if (mcpClientManager) {
        context.ui.addItem({
          type: 'info',
          text: `Restarting MCP server '${serverName}'...`,
        });
        await mcpClientManager.restartServer(serverName);
      }
      // Update the client with the new tools
      const geminiClient = context.services.agentContext?.geminiClient;
      if (geminiClient?.isInitialized()) {
        await geminiClient.setTools();
      }

      // Reload the slash commands to reflect the changes.
      context.ui.reloadCommands();

      return {
        type: 'message',
        messageType: 'info',
        content: `Successfully authenticated and reloaded tools for '${serverName}'`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to authenticate with MCP server '${serverName}': ${getErrorMessage(error)}`,
      };
    } finally {
      coreEvents.removeListener(CoreEvent.OauthDisplayMessage, displayListener);
    }
  },
  completion: async (context: CommandContext, partialArg: string) => {
    const agentContext = context.services.agentContext;
    const config = agentContext?.config;
    if (!config) return [];

    const mcpServers = config.getMcpClientManager()?.getMcpServers() || {};
    return Object.keys(mcpServers).filter((name) =>
      name.startsWith(partialArg),
    );
  },
};

const listAction = async (
  context: CommandContext,
  showDescriptions = false,
  showSchema = false,
  serverNameFilter?: string,
): Promise<void | MessageActionReturn> => {
  const agentContext = context.services.agentContext;
  const config = agentContext?.config;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    };
  }

  config.setUserInteractedWithMcp();

  const toolRegistry = agentContext.toolRegistry;
  if (!toolRegistry) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Could not retrieve tool registry.',
    };
  }

  let mcpServers = config.getMcpClientManager()?.getMcpServers() || {};
  const blockedMcpServers =
    config.getMcpClientManager()?.getBlockedMcpServers() || [];

  if (serverNameFilter) {
    const filter = serverNameFilter.trim().toLowerCase();
    if (filter) {
      mcpServers = Object.fromEntries(
        Object.entries(mcpServers).filter(
          ([name]) =>
            name.toLowerCase().includes(filter) ||
            normalizeServerId(name).includes(filter),
        ),
      );
    }
  }

  const serverNames = Object.keys(mcpServers);

  const connectingServers = serverNames.filter(
    (name) => getMCPServerStatus(name) === MCPServerStatus.CONNECTING,
  );
  const discoveryState = getMCPDiscoveryState();
  const discoveryInProgress =
    discoveryState === MCPDiscoveryState.IN_PROGRESS ||
    connectingServers.length > 0;

  const allTools = toolRegistry.getAllTools();
  const mcpTools = allTools.filter((tool) => tool instanceof DiscoveredMCPTool);

  const promptRegistry = config.getPromptRegistry();
  const mcpPrompts = promptRegistry
    .getAllPrompts()
    .filter(
      (prompt) =>
        'serverName' in prompt && serverNames.includes(prompt.serverName),
    );

  const resourceRegistry = config.getResourceRegistry();
  const mcpResources = resourceRegistry
    .getAllResources()
    .filter((entry) => serverNames.includes(entry.serverName));

  const authStatus: HistoryItemMcpStatus['authStatus'] = {};
  const tokenStorage = new MCPOAuthTokenStorage();
  for (const serverName of serverNames) {
    const server = mcpServers[serverName];
    // Check auth status for servers with oauth.enabled OR detected as requiring OAuth
    if (server.oauth?.enabled || mcpServerRequiresOAuth.has(serverName)) {
      const creds = await tokenStorage.getCredentials(serverName);
      if (creds) {
        if (creds.token.expiresAt && creds.token.expiresAt < Date.now()) {
          authStatus[serverName] = 'expired';
        } else {
          authStatus[serverName] = 'authenticated';
        }
      } else {
        authStatus[serverName] = 'unauthenticated';
      }
    } else {
      authStatus[serverName] = 'not-configured';
    }
  }

  // Get enablement state for all servers
  const enablementManager = McpServerEnablementManager.getInstance();
  const enablementState: HistoryItemMcpStatus['enablementState'] = {};
  for (const serverName of serverNames) {
    enablementState[serverName] =
      await enablementManager.getDisplayState(serverName);
  }
  const errors: Record<string, string> = {};
  for (const serverName of serverNames) {
    const error = config.getMcpClientManager()?.getLastError(serverName);
    if (error) {
      errors[serverName] = error;
    }
  }

  const mcpStatusItem: HistoryItemMcpStatus = {
    type: MessageType.MCP_STATUS,
    servers: mcpServers,
    tools: mcpTools.map((tool) => ({
      serverName: tool.serverName,
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
    })),
    prompts: mcpPrompts.map((prompt) => ({
      serverName: prompt.serverName,
      name: prompt.name,
      description: prompt.description,
    })),
    resources: mcpResources.map((resource) => ({
      serverName: resource.serverName,
      name: resource.name,
      uri: resource.uri,
      mimeType: resource.mimeType,
      description: resource.description,
    })),
    authStatus,
    enablementState,
    errors,
    blockedServers: blockedMcpServers.map((s) => ({
      name: s.name,
      extensionName: s.extensionName,
    })),
    discoveryInProgress,
    connectingServers,
    showDescriptions: Boolean(showDescriptions),
    showSchema: Boolean(showSchema),
  };

  context.ui.addItem(mcpStatusItem);
};
const listCommand: SlashCommand = {
  name: 'list',
  altNames: ['ls', 'nodesc', 'nodescription'],
  description: 'List configured MCP servers and tools',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context, args) => listAction(context, false, false, args),
};

const descCommand: SlashCommand = {
  name: 'desc',
  altNames: ['description'],
  description: 'List configured MCP servers and tools with descriptions',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context, args) => listAction(context, true, false, args),
};

const schemaCommand: SlashCommand = {
  name: 'schema',
  description:
    'List configured MCP servers and tools with descriptions and schemas',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context, args) => listAction(context, true, true, args),
};

const reloadCommand: SlashCommand = {
  name: 'reload',
  altNames: ['refresh'],
  description: 'Reloads MCP servers',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  takesArgs: false,
  action: async (
    context: CommandContext,
  ): Promise<void | SlashCommandActionReturn> => {
    const agentContext = context.services.agentContext;
    const config = agentContext?.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      };
    }

    const mcpClientManager = config.getMcpClientManager();
    if (!mcpClientManager) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Could not retrieve mcp client manager.',
      };
    }

    context.ui.addItem({
      type: 'info',
      text: 'Reloading MCP servers...',
    });

    await mcpClientManager.restart();

    // Update the client with the new tools
    const geminiClient = agentContext.geminiClient;
    if (geminiClient?.isInitialized()) {
      await geminiClient.setTools();
    }

    // Reload the slash commands to reflect the changes.
    context.ui.reloadCommands();

    return listCommand.action!(context, '');
  },
};

async function handleEnableDisable(
  context: CommandContext,
  args: string,
  enable: boolean,
): Promise<MessageActionReturn> {
  const agentContext = context.services.agentContext;
  const config = agentContext?.config;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    };
  }

  config.setUserInteractedWithMcp();

  const parts = args.trim().split(/\s+/);
  const isSession = parts.includes('--session');
  const serverName = parts.filter((p) => p !== '--session')[0];
  const action = enable ? 'enable' : 'disable';

  if (!serverName) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Server name required. Usage: /mcp ${action} <server-name> [--session]`,
    };
  }

  const name = normalizeServerId(serverName);

  // Validate server exists
  const servers = config.getMcpClientManager()?.getMcpServers() || {};
  const normalizedServerNames = Object.keys(servers).map(normalizeServerId);
  if (!normalizedServerNames.includes(name)) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Server '${serverName}' not found. Use /mcp list to see available servers.`,
    };
  }

  const manager = McpServerEnablementManager.getInstance();

  if (enable) {
    const settings = loadSettings();
    const result = await canLoadServer(name, {
      adminMcpEnabled: settings.merged.admin?.mcp?.enabled ?? true,
      allowedList: settings.merged.mcp?.allowed,
      excludedList: settings.merged.mcp?.excluded,
    });
    if (
      !result.allowed &&
      (result.blockType === 'allowlist' || result.blockType === 'excludelist')
    ) {
      return {
        type: 'message',
        messageType: 'error',
        content: result.reason ?? 'Blocked by settings.',
      };
    }
    if (isSession) {
      manager.clearSessionDisable(name);
    } else {
      await manager.enable(name);
    }
    if (result.blockType === 'admin') {
      context.ui.addItem(
        {
          type: 'warning',
          text: 'MCP disabled by admin. Will load when enabled.',
        },
        Date.now(),
      );
    }
  } else {
    if (isSession) {
      manager.disableForSession(name);
    } else {
      await manager.disable(name);
    }
  }

  const msg = `MCP server '${name}' ${enable ? 'enabled' : 'disabled'}${isSession ? ' for this session' : ''}.`;

  const mcpClientManager = config.getMcpClientManager();
  if (mcpClientManager) {
    context.ui.addItem(
      { type: 'info', text: 'Reloading MCP servers...' },
      Date.now(),
    );
    await mcpClientManager.restart();
  }
  if (agentContext.geminiClient?.isInitialized())
    await agentContext.geminiClient.setTools();
  context.ui.reloadCommands();

  return { type: 'message', messageType: 'info', content: msg };
}

async function getEnablementCompletion(
  context: CommandContext,
  partialArg: string,
  showEnabled: boolean,
): Promise<string[]> {
  const agentContext = context.services.agentContext;
  const config = agentContext?.config;
  if (!config) return [];
  const servers = Object.keys(
    config.getMcpClientManager()?.getMcpServers() || {},
  );
  const manager = McpServerEnablementManager.getInstance();
  const results: string[] = [];
  for (const n of servers) {
    const state = await manager.getDisplayState(n);
    if (state.enabled === showEnabled && n.startsWith(partialArg)) {
      results.push(n);
    }
  }
  return results;
}

const enableCommand: SlashCommand = {
  name: 'enable',
  description: 'Enable a disabled MCP server',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (ctx, args) => handleEnableDisable(ctx, args, true),
  completion: (ctx, arg) => getEnablementCompletion(ctx, arg, false),
};

const disableCommand: SlashCommand = {
  name: 'disable',
  description: 'Disable an MCP server',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (ctx, args) => handleEnableDisable(ctx, args, false),
  completion: (ctx, arg) => getEnablementCompletion(ctx, arg, true),
};

async function handleRemove(
  context: CommandContext,
  args: string,
): Promise<MessageActionReturn> {
  const agentContext = context.services.agentContext;
  const config = agentContext?.config;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    };
  }

  config.setUserInteractedWithMcp();

  // Parse args: <server-name> [--scope user|workspace|all]
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  let explicitScope: 'user' | 'workspace' | 'all' | null = null;
  const positional: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--scope' || t === '-s') {
      const v = tokens[++i];
      if (v !== 'user' && v !== 'workspace' && v !== 'all') {
        return {
          type: 'message',
          messageType: 'error',
          content: `Invalid --scope value '${v ?? ''}'. Expected: user, workspace, or all.`,
        };
      }
      explicitScope = v;
    } else if (t.startsWith('--scope=')) {
      const v = t.slice('--scope='.length);
      if (v !== 'user' && v !== 'workspace' && v !== 'all') {
        return {
          type: 'message',
          messageType: 'error',
          content: `Invalid --scope value '${v}'. Expected: user, workspace, or all.`,
        };
      }
      explicitScope = v;
    } else {
      positional.push(t);
    }
  }

  const serverName = positional[0];
  if (!serverName) {
    return {
      type: 'message',
      messageType: 'error',
      content:
        'Server name required. Usage: /mcp remove <server-name> [--scope user|workspace|all]',
    };
  }

  const name = normalizeServerId(serverName);
  const servers = config.getMcpClientManager()?.getMcpServers() ?? {};
  const matchedKey = Object.keys(servers).find(
    (n) => normalizeServerId(n) === name,
  );
  if (!matchedKey) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Server '${serverName}' not found. Use /mcp list to see available servers.`,
    };
  }

  // Servers contributed by extensions live in the extension manifest, not in
  // the user/workspace settings file, so they cannot be removed via /mcp.
  const extensionInfo = servers[matchedKey]?.extension;
  if (extensionInfo) {
    return {
      type: 'message',
      messageType: 'error',
      content: `'${matchedKey}' is provided by extension '${extensionInfo.name}'. Use /extensions to manage it.`,
    };
  }

  // Detect which physical settings files actually contain this entry. The
  // entry can live in workspace, user, or both (in which case workspace
  // overrides user via shallow merge but the user copy stays as a "zombie").
  const settings = loadSettings();
  type RemovableScope = SettingScope.Workspace | SettingScope.User;
  const scopeOrder: readonly RemovableScope[] = [
    SettingScope.Workspace,
    SettingScope.User,
  ];
  const foundIn: RemovableScope[] = [];
  for (const scope of scopeOrder) {
    const file = settings.forScope(scope);
    const scoped = (file.settings.mcpServers ?? {}) as Record<string, unknown>;
    if (matchedKey in scoped) foundIn.push(scope);
  }

  if (foundIn.length === 0) {
    return {
      type: 'message',
      messageType: 'error',
      content: `'${matchedKey}' is not defined in user or workspace settings and cannot be removed.`,
    };
  }

  // Resolve which scope(s) to actually delete from.
  let targetScopes: RemovableScope[];
  if (explicitScope === 'all') {
    targetScopes = foundIn;
  } else if (explicitScope === 'user') {
    if (!foundIn.includes(SettingScope.User)) {
      return {
        type: 'message',
        messageType: 'error',
        content: `'${matchedKey}' is not defined in user settings.`,
      };
    }
    targetScopes = [SettingScope.User];
  } else if (explicitScope === 'workspace') {
    if (!foundIn.includes(SettingScope.Workspace)) {
      return {
        type: 'message',
        messageType: 'error',
        content: `'${matchedKey}' is not defined in workspace settings.`,
      };
    }
    targetScopes = [SettingScope.Workspace];
  } else if (foundIn.length > 1) {
    // Ambiguous and no explicit choice — refuse rather than silently delete
    // only one copy and leave the user wondering why /mcp list still shows it.
    return {
      type: 'message',
      messageType: 'error',
      content: `'${matchedKey}' is defined in BOTH workspace and user settings. Use \`/mcp remove ${matchedKey} --scope workspace\`, \`--scope user\`, or \`--scope all\` to choose.`,
    };
  } else {
    targetScopes = foundIn;
  }

  for (const scope of targetScopes) {
    const file = settings.forScope(scope);
    const scoped = (file.settings.mcpServers ?? {}) as Record<string, unknown>;
    const next = { ...scoped };
    delete next[matchedKey];
    settings.setValue(scope, 'mcpServers', next);
  }

  const mcpClientManager = config.getMcpClientManager();
  if (mcpClientManager) {
    context.ui.addItem(
      { type: 'info', text: 'Reloading MCP servers...' },
      Date.now(),
    );
    await mcpClientManager.restart();
  }
  if (agentContext.geminiClient?.isInitialized()) {
    await agentContext.geminiClient.setTools();
  }
  context.ui.reloadCommands();

  const where = targetScopes.map((s) => s.toLowerCase()).join(' and ');
  return {
    type: 'message',
    messageType: 'info',
    content: `MCP server '${matchedKey}' removed from ${where} settings.`,
  };
}

const removeCommand: SlashCommand = {
  name: 'remove',
  altNames: ['rm'],
  description: 'Remove an MCP server from your settings',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: handleRemove,
  completion: async (context: CommandContext, partialArg: string) => {
    const config = context.services.agentContext?.config;
    if (!config) return [];
    const servers = config.getMcpClientManager()?.getMcpServers() ?? {};
    return Object.entries(servers)
      .filter(([, s]) => !s.extension)
      .map(([n]) => n)
      .filter((n) => n.startsWith(partialArg));
  },
};

export const mcpCommand: SlashCommand = {
  name: 'mcp',
  description: 'Manage configured Model Context Protocol (MCP) servers',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    listCommand,
    descCommand,
    schemaCommand,
    authCommand,
    reloadCommand,
    enableCommand,
    disableCommand,
    removeCommand,
  ],
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<void | SlashCommandActionReturn> => {
    if (args) {
      const parsed = parseSlashCommand(`/${args}`, mcpCommand.subCommands!);
      if (parsed.commandToExecute?.action) {
        return parsed.commandToExecute.action(context, parsed.args);
      }
      // If no subcommand matches, treat the whole args as a filter for list
      return listAction(context, false, false, args);
    }
    return listAction(context);
  },
};
