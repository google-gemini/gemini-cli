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
import type {
  DiscoveredMCPPrompt,
  DiscoveredMCPResource,
  MessageActionReturn,
} from '@google/gemini-cli-core';
import {
  DiscoveredMCPTool,
  getMCPDiscoveryState,
  getMCPServerStatus,
  MCPDiscoveryState,
  MCPServerStatus,
  getErrorMessage,
  MCPOAuthTokenStorage,
  mcpServerRequiresOAuth,
} from '@google/gemini-cli-core';
import { appEvents, AppEvent } from '../../utils/events.js';
import { MessageType, type HistoryItemMcpStatus } from '../types.js';
import { SettingScope } from '../../config/settings.js';

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
    const { config } = context.services;

    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      };
    }

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
      context.ui.addItem({ type: 'info', text: message }, Date.now());
    };

    appEvents.on(AppEvent.OauthDisplayMessage, displayListener);

    try {
      context.ui.addItem(
        {
          type: 'info',
          text: `Starting OAuth authentication for MCP server '${serverName}'...`,
        },
        Date.now(),
      );

      // Import dynamically to avoid circular dependencies
      const { MCPOAuthProvider } = await import('@google/gemini-cli-core');

      let oauthConfig = server.oauth;
      if (!oauthConfig) {
        oauthConfig = { enabled: false };
      }

      const mcpServerUrl = server.httpUrl || server.url;
      const authProvider = new MCPOAuthProvider(new MCPOAuthTokenStorage());
      await authProvider.authenticate(
        serverName,
        oauthConfig,
        mcpServerUrl,
        appEvents,
      );

      context.ui.addItem(
        {
          type: 'info',
          text: `✅ Successfully authenticated with MCP server '${serverName}'!`,
        },
        Date.now(),
      );

      // Trigger tool re-discovery to pick up authenticated server
      const mcpClientManager = config.getMcpClientManager();
      if (mcpClientManager) {
        context.ui.addItem(
          {
            type: 'info',
            text: `Restarting MCP server '${serverName}'...`,
          },
          Date.now(),
        );
        await mcpClientManager.restartServer(serverName);
      }
      // Update the client with the new tools
      const geminiClient = config.getGeminiClient();
      if (geminiClient?.isInitialized()) {
        await geminiClient.setTools();
      }

      // Reload the slash commands to reflect the changes.
      context.ui.reloadCommands();

      return {
        type: 'message',
        messageType: 'info',
        content: `Successfully authenticated and refreshed tools for '${serverName}'.`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to authenticate with MCP server '${serverName}': ${getErrorMessage(error)}`,
      };
    } finally {
      appEvents.removeListener(AppEvent.OauthDisplayMessage, displayListener);
    }
  },
  completion: async (context: CommandContext, partialArg: string) => {
    const { config } = context.services;
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
): Promise<void | MessageActionReturn> => {
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    };
  }

  const toolRegistry = config.getToolRegistry();
  if (!toolRegistry) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Could not retrieve tool registry.',
    };
  }

  const mcpServers = config.getMcpClientManager()?.getMcpServers() || {};
  const serverNames = Object.keys(mcpServers);
  const blockedMcpServers =
    config.getMcpClientManager()?.getBlockedMcpServers() || [];

  const connectingServers = serverNames.filter(
    (name) => getMCPServerStatus(name) === MCPServerStatus.CONNECTING,
  );
  const discoveryState = getMCPDiscoveryState();
  const discoveryInProgress =
    discoveryState === MCPDiscoveryState.IN_PROGRESS ||
    connectingServers.length > 0;

  const allTools = toolRegistry.getAllTools();
  const mcpTools = allTools.filter(
    (tool) => tool instanceof DiscoveredMCPTool,
  ) as DiscoveredMCPTool[];

  const promptRegistry = await config.getPromptRegistry();
  const mcpPrompts = promptRegistry
    .getAllPrompts()
    .filter(
      (prompt) =>
        'serverName' in prompt &&
        serverNames.includes(prompt.serverName as string),
    ) as DiscoveredMCPPrompt[];

  const resourceRegistry = config.getResourceRegistry();
  const mcpResources = resourceRegistry
    .getAllResources()
    .filter((entry) =>
      serverNames.includes(entry.serverName),
    ) as DiscoveredMCPResource[];

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

  // Get disabled servers from settings
  const disabledServers = context.services.settings.merged.mcp?.disabled || [];

  // Get session mounted/unmounted servers
  const sessionMountedServers = Array.from(
    context.session.sessionMountedMcpServers,
  );
  const sessionUnmountedServers = Array.from(
    context.session.sessionUnmountedMcpServers,
  );

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
      serverName: prompt.serverName as string,
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
    blockedServers: blockedMcpServers,
    disabledServers,
    sessionMountedServers,
    sessionUnmountedServers,
    discoveryInProgress,
    connectingServers,
    showDescriptions,
    showSchema,
  };

  context.ui.addItem(mcpStatusItem, Date.now());
};

const listCommand: SlashCommand = {
  name: 'list',
  altNames: ['ls', 'nodesc', 'nodescription'],
  description: 'List configured MCP servers and tools',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context) => listAction(context),
};

const descCommand: SlashCommand = {
  name: 'desc',
  altNames: ['description'],
  description: 'List configured MCP servers and tools with descriptions',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context) => listAction(context, true),
};

const schemaCommand: SlashCommand = {
  name: 'schema',
  description:
    'List configured MCP servers and tools with descriptions and schemas',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context) => listAction(context, true, true),
};

const refreshCommand: SlashCommand = {
  name: 'refresh',
  description: 'Restarts MCP servers',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (
    context: CommandContext,
  ): Promise<void | SlashCommandActionReturn> => {
    const { config } = context.services;
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

    context.ui.addItem(
      {
        type: 'info',
        text: 'Restarting MCP servers...',
      },
      Date.now(),
    );

    await mcpClientManager.restart();

    // Update the client with the new tools
    const geminiClient = config.getGeminiClient();
    if (geminiClient?.isInitialized()) {
      await geminiClient.setTools();
    }

    // Reload the slash commands to reflect the changes.
    context.ui.reloadCommands();

    return listCommand.action!(context, '');
  },
};

/**
 * Get completion for MCP server names (connected, configured, or previously seen)
 */
function completeMcpServerNames(
  context: CommandContext,
  partialArg: string,
): string[] {
  const { config } = context.services;
  if (!config) return [];

  const mcpClientManager = config.getMcpClientManager();
  if (!mcpClientManager) return [];

  const allServerNames = mcpClientManager.getAllMcpServerNames();

  return allServerNames.filter((name) => name.startsWith(partialArg));
}

/**
 * Enable an MCP server (persistent - survives restarts)
 */
async function enableAction(
  context: CommandContext,
  args: string,
): Promise<void | MessageActionReturn> {
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    };
  }

  const serverName = args.trim();
  if (!serverName) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Usage: /mcp enable <server-name>',
    };
  }

  const mcpClientManager = config.getMcpClientManager();
  if (!mcpClientManager) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Could not retrieve MCP client manager.',
    };
  }

  // Get current disabled servers from settings
  const settings = context.services.settings;
  const disabledServers: string[] = settings.merged.mcp?.disabled || [];

  // Check if it's actually disabled
  if (!disabledServers.includes(serverName)) {
    return {
      type: 'message',
      messageType: 'info',
      content: `MCP server "${serverName}" is not disabled.`,
    };
  }

  try {
    let wasRemoved = false;

    // Check and remove from Workspace scope
    const workspaceDisabled: string[] =
      settings.workspace.settings.mcp?.disabled || [];
    if (workspaceDisabled.includes(serverName)) {
      const newWorkspaceDisabled = workspaceDisabled.filter(
        (name) => name !== serverName,
      );
      settings.setValue(
        SettingScope.Workspace,
        'mcp.disabled',
        newWorkspaceDisabled,
      );
      wasRemoved = true;
    }

    // Check and remove from User scope
    const userDisabled: string[] = settings.user.settings.mcp?.disabled || [];
    if (userDisabled.includes(serverName)) {
      const newUserDisabled = userDisabled.filter(
        (name) => name !== serverName,
      );
      settings.setValue(SettingScope.User, 'mcp.disabled', newUserDisabled);
      wasRemoved = true;
    }

    if (!wasRemoved) {
      // It must be in System or SystemDefaults, which we probably can't/shouldn't modify here
      return {
        type: 'message',
        messageType: 'error',
        content: `MCP server "${serverName}" is disabled in System settings and cannot be enabled via this command.`,
      };
    }

    // Get the server config (check both user config and known configs from extensions)
    const serverConfig =
      mcpClientManager.getServerConfig(serverName) ||
      config.getMcpServers()?.[serverName];

    // Check if server is blocked
    const blockedServers = mcpClientManager.getBlockedMcpServers();
    const isBlocked = blockedServers.some((s) => s.name === serverName);

    if (serverConfig) {
      context.ui.addItem(
        {
          type: 'info',
          text: `Enabling and connecting MCP server "${serverName}"...`,
        },
        Date.now(),
      );

      // Use forceConnect since we just updated settings and need to bypass stale cache
      await mcpClientManager.maybeDiscoverMcpServer(serverName, serverConfig, {
        forceConnect: true,
      });

      // Update the client with the new tools
      const geminiClient = config.getGeminiClient();
      if (geminiClient?.isInitialized()) {
        await geminiClient.setTools();
      }

      // Reload the slash commands to reflect the changes
      context.ui.reloadCommands();
    }

    const blockedWarning = isBlocked
      ? '\n\n⚠️  Warning: This server appears to be blocked by your configuration (mcp.allowed/mcp.excluded). It may not function until unblocked.'
      : '';

    return {
      type: 'message',
      messageType: 'info',
      content: `MCP server "${serverName}" enabled successfully.${blockedWarning}`,
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to enable MCP server: ${getErrorMessage(error)}`,
    };
  }
}

/**
 * Disable an MCP server (persistent - survives restarts)
 */
async function disableAction(
  context: CommandContext,
  args: string,
): Promise<void | MessageActionReturn> {
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    };
  }

  const serverName = args.trim();
  if (!serverName) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Usage: /mcp disable <server-name>',
    };
  }

  const mcpClientManager = config.getMcpClientManager();
  if (!mcpClientManager) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Could not retrieve MCP client manager.',
    };
  }

  // Get current disabled servers from settings
  const settings = context.services.settings;
  const disabledServers: string[] = settings.merged.mcp?.disabled || [];

  // Check if already disabled
  if (disabledServers.includes(serverName)) {
    return {
      type: 'message',
      messageType: 'info',
      content: `MCP server "${serverName}" is already disabled.`,
    };
  }

  try {
    // Add to disabled list
    const newDisabledServers = [...disabledServers, serverName];

    // Update settings (persists to file)
    settings.setValue(SettingScope.User, 'mcp.disabled', newDisabledServers);

    // Disconnect the server
    context.ui.addItem(
      {
        type: 'info',
        text: `Disabling and disconnecting MCP server "${serverName}"...`,
      },
      Date.now(),
    );

    await mcpClientManager.disconnectServer(serverName);

    // Update the client with the new tools
    const geminiClient = config.getGeminiClient();
    if (geminiClient?.isInitialized()) {
      await geminiClient.setTools();
    }

    // Reload the slash commands to reflect the changes
    context.ui.reloadCommands();

    return {
      type: 'message',
      messageType: 'info',
      content: `MCP server "${serverName}" disabled successfully.`,
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to disable MCP server: ${getErrorMessage(error)}`,
    };
  }
}

/**
 * Mount an MCP server (session-only - temporarily enables for this session)
 * This overrides the disabled state if the server is disabled.
 */
async function mountAction(
  context: CommandContext,
  args: string,
): Promise<void | MessageActionReturn> {
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    };
  }

  const serverName = args.trim();
  if (!serverName) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Usage: /mcp mount <server-name>',
    };
  }

  const mcpClientManager = config.getMcpClientManager();
  if (!mcpClientManager) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Could not retrieve MCP client manager.',
    };
  }

  // Check if server exists in config (either user-configured or from extensions)
  const serverConfig =
    mcpClientManager.getServerConfig(serverName) ||
    config.getMcpServers()?.[serverName];
  if (!serverConfig) {
    return {
      type: 'message',
      messageType: 'error',
      content: `MCP server "${serverName}" is not configured. The server must have been discovered at least once before it can be mounted.`,
    };
  }

  // Check if already connected and not in any override state
  const connectedServers = mcpClientManager.getMcpServers();
  const isConnected = serverName in connectedServers;
  const isSessionUnmounted =
    context.session.sessionUnmountedMcpServers.has(serverName);
  const settings = context.services.settings;
  const disabledServers: string[] = settings.merged.mcp?.disabled || [];
  const isDisabled = disabledServers.includes(serverName);

  // Check if server is blocked
  const blockedServers = mcpClientManager.getBlockedMcpServers();
  const isBlocked = blockedServers.some((s) => s.name === serverName);

  if (isConnected && !isSessionUnmounted) {
    return {
      type: 'message',
      messageType: 'info',
      content: `MCP server "${serverName}" is already connected.`,
    };
  }

  try {
    // Add to session mounted set (overrides disabled)
    if (context.session.setSessionMountedMcpServers) {
      context.session.setSessionMountedMcpServers(
        (prev) => new Set([...prev, serverName]),
      );
    }

    // Remove from session unmounted set if present
    if (context.session.setSessionUnmountedMcpServers) {
      context.session.setSessionUnmountedMcpServers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(serverName);
        return newSet;
      });
    }

    const statusText = isDisabled
      ? `Mounting disabled MCP server "${serverName}" for this session...`
      : `Mounting MCP server "${serverName}" for this session...`;

    context.ui.addItem(
      {
        type: 'info',
        text: statusText,
      },
      Date.now(),
    );

    // Use forceConnect to bypass disabled/session checks since mount is explicit
    await mcpClientManager.maybeDiscoverMcpServer(serverName, serverConfig, {
      forceConnect: true,
    });

    // Update the client with the new tools
    const geminiClient = config.getGeminiClient();
    if (geminiClient?.isInitialized()) {
      await geminiClient.setTools();
    }

    // Reload the slash commands to reflect the changes
    context.ui.reloadCommands();

    let resultText = isDisabled
      ? `MCP server "${serverName}" mounted for this session (will return to disabled on restart).`
      : `MCP server "${serverName}" mounted for this session.`;

    if (isBlocked) {
      resultText +=
        '\n\n⚠️  Warning: This server is blocked by your configuration (mcp.allowed/mcp.excluded), but is being forcefully mounted for this session.';
    }

    return {
      type: 'message',
      messageType: 'info',
      content: resultText,
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to mount MCP server: ${getErrorMessage(error)}`,
    };
  }
}

/**
 * Unmount an MCP server (session-only - temporarily disables for this session)
 * The server will reconnect on restart if it's enabled.
 */
async function unmountAction(
  context: CommandContext,
  args: string,
): Promise<void | MessageActionReturn> {
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    };
  }

  const serverName = args.trim();
  if (!serverName) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Usage: /mcp unmount <server-name>',
    };
  }

  const mcpClientManager = config.getMcpClientManager();
  if (!mcpClientManager) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Could not retrieve MCP client manager.',
    };
  }

  // Check if already unmounted in session
  const isSessionUnmounted =
    context.session.sessionUnmountedMcpServers.has(serverName);
  if (isSessionUnmounted) {
    return {
      type: 'message',
      messageType: 'info',
      content: `MCP server "${serverName}" is already unmounted in this session.`,
    };
  }

  // Check if server is connected or session-mounted
  const connectedServers = mcpClientManager.getMcpServers();
  const isConnected = serverName in connectedServers;
  const isSessionMounted =
    context.session.sessionMountedMcpServers.has(serverName);

  if (!isConnected && !isSessionMounted) {
    return {
      type: 'message',
      messageType: 'info',
      content: `MCP server "${serverName}" is not currently connected.`,
    };
  }

  try {
    // Add to session unmounted set
    if (context.session.setSessionUnmountedMcpServers) {
      context.session.setSessionUnmountedMcpServers(
        (prev) => new Set([...prev, serverName]),
      );
    }

    // Remove from session mounted set if present
    if (context.session.setSessionMountedMcpServers) {
      context.session.setSessionMountedMcpServers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(serverName);
        return newSet;
      });
    }

    // Disconnect the server
    context.ui.addItem(
      {
        type: 'info',
        text: `Unmounting MCP server "${serverName}" for this session...`,
      },
      Date.now(),
    );

    await mcpClientManager.disconnectServer(serverName);

    // Update the client with the new tools
    const geminiClient = config.getGeminiClient();
    if (geminiClient?.isInitialized()) {
      await geminiClient.setTools();
    }

    // Reload the slash commands to reflect the changes
    context.ui.reloadCommands();

    return {
      type: 'message',
      messageType: 'info',
      content: `MCP server "${serverName}" unmounted for this session. It will reconnect on restart.`,
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to unmount MCP server: ${getErrorMessage(error)}`,
    };
  }
}

const enableCommand: SlashCommand = {
  name: 'enable',
  description: 'Enable a disabled MCP server (persistent)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: enableAction,
  completion: completeMcpServerNames,
};

const disableCommand: SlashCommand = {
  name: 'disable',
  description: 'Disable an MCP server (persistent)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: disableAction,
  completion: completeMcpServerNames,
};

const mountCommand: SlashCommand = {
  name: 'mount',
  description: 'Mount an unmounted MCP server (session-only)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: mountAction,
  completion: completeMcpServerNames,
};

const unmountCommand: SlashCommand = {
  name: 'unmount',
  description: 'Unmount an MCP server for this session',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: unmountAction,
  completion: completeMcpServerNames,
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
    refreshCommand,
    enableCommand,
    disableCommand,
    mountCommand,
    unmountCommand,
  ],
  action: async (context: CommandContext) => listAction(context),
};
