/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SlashCommand,
  SlashCommandActionReturn,
  CommandContext,
  MessageActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import type { DiscoveredMCPPrompt } from '@google/gemini-cli-core';
import {
  DiscoveredMCPTool,
  getMCPDiscoveryState,
  getMCPServerStatus,
  MCPDiscoveryState,
  MCPServerStatus,
  getErrorMessage,
  MCPOAuthTokenStorage,
} from '@google/gemini-cli-core';
import { appEvents, AppEvent } from '../../utils/events.js';
import { MessageType, type HistoryItemMcpStatus } from '../types.js';

const authCommand: SlashCommand = {
  name: 'auth',
  description: 'Authenticate with an OAuth-enabled MCP server',
  kind: CommandKind.BUILT_IN,
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

    const mcpServers = config.getMcpServers() || {};

    if (!serverName) {
      // List servers that support OAuth
      const oauthServers = Object.entries(mcpServers)
        .filter(([_, server]) => server.oauth?.enabled)
        .map(([name, _]) => name);

      if (oauthServers.length === 0) {
        return {
          type: 'message',
          messageType: 'info',
          content: 'No MCP servers configured with OAuth authentication.',
        };
      }

      return {
        type: 'message',
        messageType: 'info',
        content: `MCP servers with OAuth authentication:\n${oauthServers.map((s) => `  - ${s}`).join('\n')}\n\nUse /mcp auth <server-name> to authenticate.`,
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
      const toolRegistry = config.getToolRegistry();
      if (toolRegistry) {
        context.ui.addItem(
          {
            type: 'info',
            text: `Re-discovering tools from '${serverName}'...`,
          },
          Date.now(),
        );
        await toolRegistry.discoverToolsForServer(serverName);
      }
      // Update the client with the new tools
      const geminiClient = config.getGeminiClient();
      if (geminiClient) {
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

    const mcpServers = config.getMcpServers() || {};
    return Object.keys(mcpServers).filter((name) =>
      name.startsWith(partialArg),
    );
  },
};

const listCommand: SlashCommand = {
  name: 'list',
  description: 'List configured MCP servers and tools',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
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

    const lowerCaseArgs = args.toLowerCase().split(/\s+/).filter(Boolean);

    const hasDesc =
      lowerCaseArgs.includes('desc') || lowerCaseArgs.includes('descriptions');
    const hasNodesc =
      lowerCaseArgs.includes('nodesc') ||
      lowerCaseArgs.includes('nodescriptions');
    const showSchema = lowerCaseArgs.includes('schema');

    const showDescriptions = !hasNodesc && (hasDesc || showSchema);
    const showTips = lowerCaseArgs.length === 0;

    const mcpServers = config.getMcpServers() || {};
    const serverNames = Object.keys(mcpServers);
    const blockedMcpServers = config.getBlockedMcpServers() || [];

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

    const authStatus: HistoryItemMcpStatus['authStatus'] = {};
    const tokenStorage = new MCPOAuthTokenStorage();
    for (const serverName of serverNames) {
      const server = mcpServers[serverName];
      if (server.oauth?.enabled) {
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
        serverName: prompt.serverName as string,
        name: prompt.name,
        description: prompt.description,
      })),
      authStatus,
      blockedServers: blockedMcpServers,
      discoveryInProgress,
      connectingServers,
      showDescriptions,
      showSchema,
      showTips,
    };

    context.ui.addItem(mcpStatusItem, Date.now());
  },
};

const refreshCommand: SlashCommand = {
  name: 'refresh',
  description: 'Restarts MCP servers.',
  kind: CommandKind.BUILT_IN,
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

    const toolRegistry = config.getToolRegistry();
    if (!toolRegistry) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Could not retrieve tool registry.',
      };
    }

    context.ui.addItem(
      {
        type: 'info',
        text: 'Restarting MCP servers...',
      },
      Date.now(),
    );

    await toolRegistry.restartMcpServers();

    // Update the client with the new tools
    const geminiClient = config.getGeminiClient();
    if (geminiClient) {
      await geminiClient.setTools();
    }

    // Reload the slash commands to reflect the changes.
    context.ui.reloadCommands();

    return listCommand.action!(context, '');
  },
};

export const mcpCommand: SlashCommand = {
  name: 'mcp',
  description:
    'list configured MCP servers and tools, or authenticate with OAuth-enabled servers',
  kind: CommandKind.BUILT_IN,
  subCommands: [listCommand, authCommand, refreshCommand],
  // Default action when no subcommand is provided
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<void | SlashCommandActionReturn> =>
    // If no subcommand, run the list command
    listCommand.action!(context, args),
};
