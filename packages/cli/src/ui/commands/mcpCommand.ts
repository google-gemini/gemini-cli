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
} from '@google/gemini-cli-core';
import { appEvents, AppEvent } from '../../utils/events.js';
import { MessageType, type HistoryItemMcpStatus } from '../types.js';

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
      context.ui.addItem({ type: 'info', text: message });
    };

    appEvents.on(AppEvent.OauthDisplayMessage, displayListener);

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
      await authProvider.authenticate(
        serverName,
        oauthConfig,
        mcpServerUrl,
        appEvents,
      );

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
    blockedServers: blockedMcpServers,
    discoveryInProgress,
    connectingServers,
    showDescriptions,
    showSchema,
  };

  context.ui.addItem(mcpStatusItem);
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

    context.ui.addItem({
      type: 'info',
      text: 'Restarting MCP servers...',
    });

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
  ],
  action: async (context: CommandContext) => listAction(context),
};
