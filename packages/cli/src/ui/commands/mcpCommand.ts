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
  mcpServerRequiresOAuth,
  getErrorMessage,
  MCPOAuthTokenStorage,
} from '@google/gemini-cli-core';

const COLOR_GREEN = '\u001b[32m';
const COLOR_YELLOW = '\u001b[33m';
const COLOR_RED = '\u001b[31m';
const COLOR_CYAN = '\u001b[36m';
const COLOR_GREY = '\u001b[90m';
const RESET_COLOR = '\u001b[0m';

const getMcpStatus = async (
  context: CommandContext,
  showDescriptions: boolean,
  showSchema: boolean,
  showTips: boolean = false,
): Promise<SlashCommandActionReturn> => {
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

  const mcpServers = config.getMcpServers() || {};
  const serverNames = Object.keys(mcpServers);
  const blockedMcpServers = config.getBlockedMcpServers() || [];

  if (serverNames.length === 0 && blockedMcpServers.length === 0) {
    const docsUrl = 'https://goo.gle/gemini-cli-docs-mcp';
    return {
      type: 'message',
      messageType: 'info',
      content: `No MCP servers configured. Please view MCP documentation in your browser: ${docsUrl} or use the cli /docs command`,
    };
  }

  // Check if any servers are still connecting
  const connectingServers = serverNames.filter(
    (name) => getMCPServerStatus(name) === MCPServerStatus.CONNECTING,
  );
  const discoveryState = getMCPDiscoveryState();

  let message = '';

  // Add overall discovery status message if needed
  if (
    discoveryState === MCPDiscoveryState.IN_PROGRESS ||
    connectingServers.length > 0
  ) {
    message += `${COLOR_YELLOW}⏳ MCP servers are starting up (${connectingServers.length} initializing)...${RESET_COLOR}\n`;
    message += `${COLOR_CYAN}Note: First startup may take longer. Tool availability will update automatically.${RESET_COLOR}\n\n`;
  }

  message += 'Configured MCP servers:\n\n';

  const allTools = toolRegistry.getAllTools();
  for (const serverName of serverNames) {
    const serverTools = allTools.filter(
      (tool) =>
        tool instanceof DiscoveredMCPTool && tool.serverName === serverName,
    ) as DiscoveredMCPTool[];
    const promptRegistry = await config.getPromptRegistry();
    const serverPrompts = promptRegistry.getPromptsByServer(serverName) || [];

    const originalStatus = getMCPServerStatus(serverName);
    const hasCachedItems = serverTools.length > 0 || serverPrompts.length > 0;

    // If the server is "disconnected" but has prompts or cached tools, display it as Ready
    // by using CONNECTED as the display status.
    const status =
      originalStatus === MCPServerStatus.DISCONNECTED && hasCachedItems
        ? MCPServerStatus.CONNECTED
        : originalStatus;

    // Add status indicator with descriptive text
    let statusIndicator = '';
    let statusText = '';
    switch (status) {
      case MCPServerStatus.CONNECTED:
        statusIndicator = '🟢';
        statusText = 'Ready';
        break;
      case MCPServerStatus.CONNECTING:
        statusIndicator = '🔄';
        statusText = 'Starting... (first startup may take longer)';
        break;
      case MCPServerStatus.DISCONNECTED:
      default:
        statusIndicator = '🔴';
        statusText = 'Disconnected';
        break;
    }

    // Get server description if available
    const server = mcpServers[serverName];
    let serverDisplayName = serverName;
    if (server.extensionName) {
      serverDisplayName += ` (from ${server.extensionName})`;
    }

    // Format server header with bold formatting and status
    message += `${statusIndicator} \u001b[1m${serverDisplayName}\u001b[0m - ${statusText}`;

    let needsAuthHint = mcpServerRequiresOAuth.get(serverName) || false;
    // Add OAuth status if applicable
    if (server?.oauth?.enabled) {
      needsAuthHint = true;
      try {
        const { MCPOAuthTokenStorage } = await import(
          '@google/gemini-cli-core'
        );
        const tokenStorage = new MCPOAuthTokenStorage();
        const hasToken = await tokenStorage.getToken(serverName);
        if (hasToken) {
          const isExpired = tokenStorage.isTokenExpired(hasToken.token);
          if (isExpired) {
            message += ` ${COLOR_YELLOW}(OAuth token expired)${RESET_COLOR}`;
          } else {
            message += ` ${COLOR_GREEN}(OAuth authenticated)${RESET_COLOR}`;
            needsAuthHint = false;
          }
        } else {
          message += ` ${COLOR_RED}(OAuth not authenticated)${RESET_COLOR}`;
        }
      } catch (_err) {
        // If we can't check OAuth status, just continue
      }
    }

    // Add tool count with conditional messaging
    if (status === MCPServerStatus.CONNECTED) {
      const parts = [];
      if (serverTools.length > 0) {
        parts.push(
          `${serverTools.length} ${serverTools.length === 1 ? 'tool' : 'tools'}`,
        );
      }
      if (serverPrompts.length > 0) {
        parts.push(
          `${serverPrompts.length} ${
            serverPrompts.length === 1 ? 'prompt' : 'prompts'
          }`,
        );
      }
      if (parts.length > 0) {
        message += ` (${parts.join(', ')})`;
      } else {
        message += ` (0 tools)`;
      }
    } else if (status === MCPServerStatus.CONNECTING) {
      message += ` (tools and prompts will appear when ready)`;
    } else {
      message += ` (${serverTools.length} tools cached)`;
    }

    // Add server description with proper handling of multi-line descriptions
    if (showDescriptions && server?.description) {
      const descLines = server.description.trim().split('\n');
      if (descLines) {
        message += ':\n';
        for (const descLine of descLines) {
          message += `    ${COLOR_GREEN}${descLine}${RESET_COLOR}\n`;
        }
      } else {
        message += '\n';
      }
    } else {
      message += '\n';
    }

    // Reset formatting after server entry
    message += RESET_COLOR;

    if (serverTools.length > 0) {
      message += `  ${COLOR_CYAN}Tools:${RESET_COLOR}\n`;
      serverTools.forEach((tool) => {
        if (showDescriptions && tool.description) {
          // Format tool name in cyan using simple ANSI cyan color
          message += `  - ${COLOR_CYAN}${tool.name}${RESET_COLOR}`;

          // Handle multi-line descriptions by properly indenting and preserving formatting
          const descLines = tool.description.trim().split('\n');
          if (descLines) {
            message += ':\n';
            for (const descLine of descLines) {
              message += `      ${COLOR_GREEN}${descLine}${RESET_COLOR}\n`;
            }
          } else {
            message += '\n';
          }
          // Reset is handled inline with each line now
        } else {
          // Use cyan color for the tool name even when not showing descriptions
          message += `  - ${COLOR_CYAN}${tool.name}${RESET_COLOR}\n`;
        }
        const parameters =
          tool.schema.parametersJsonSchema ?? tool.schema.parameters;
        if (showSchema && parameters) {
          // Prefix the parameters in cyan
          message += `    ${COLOR_CYAN}Parameters:${RESET_COLOR}\n`;

          const paramsLines = JSON.stringify(parameters, null, 2)
            .trim()
            .split('\n');
          if (paramsLines) {
            for (const paramsLine of paramsLines) {
              message += `      ${COLOR_GREEN}${paramsLine}${RESET_COLOR}\n`;
            }
          }
        }
      });
    }
    if (serverPrompts.length > 0) {
      if (serverTools.length > 0) {
        message += '\n';
      }
      message += `  ${COLOR_CYAN}Prompts:${RESET_COLOR}\n`;
      serverPrompts.forEach((prompt: DiscoveredMCPPrompt) => {
        if (showDescriptions && prompt.description) {
          message += `  - ${COLOR_CYAN}${prompt.name}${RESET_COLOR}`;
          const descLines = prompt.description.trim().split('\n');
          if (descLines) {
            message += ':\n';
            for (const descLine of descLines) {
              message += `      ${COLOR_GREEN}${descLine}${RESET_COLOR}\n`;
            }
          } else {
            message += '\n';
          }
        } else {
          message += `  - ${COLOR_CYAN}${prompt.name}${RESET_COLOR}\n`;
        }
      });
    }

    if (serverTools.length === 0 && serverPrompts.length === 0) {
      message += '  No tools or prompts available\n';
    } else if (serverTools.length === 0) {
      message += '  No tools available';
      if (originalStatus === MCPServerStatus.DISCONNECTED && needsAuthHint) {
        message += ` ${COLOR_GREY}(type: "/mcp auth ${serverName}" to authenticate this server)${RESET_COLOR}`;
      }
      message += '\n';
    } else if (
      originalStatus === MCPServerStatus.DISCONNECTED &&
      needsAuthHint
    ) {
      // This case is for when serverTools.length > 0
      message += `  ${COLOR_GREY}(type: "/mcp auth ${serverName}" to authenticate this server)${RESET_COLOR}\n`;
    }
    message += '\n';
  }

  for (const server of blockedMcpServers) {
    let serverDisplayName = server.name;
    if (server.extensionName) {
      serverDisplayName += ` (from ${server.extensionName})`;
    }
    message += `🔴 \u001b[1m${serverDisplayName}\u001b[0m - Blocked\n\n`;
  }

  // Add helpful tips when no arguments are provided
  if (showTips) {
    message += '\n';
    message += `${COLOR_CYAN}💡 Tips:${RESET_COLOR}\n`;
    message += `  • Use ${COLOR_CYAN}/mcp desc${RESET_COLOR} to show server and tool descriptions\n`;
    message += `  • Use ${COLOR_CYAN}/mcp schema${RESET_COLOR} to show tool parameter schemas\n`;
    message += `  • Use ${COLOR_CYAN}/mcp nodesc${RESET_COLOR} to hide descriptions\n`;
    message += `  • Use ${COLOR_CYAN}/mcp auth <server-name>${RESET_COLOR} to authenticate with OAuth-enabled servers\n`;
    message += `  • Press ${COLOR_CYAN}Ctrl+T${RESET_COLOR} to toggle tool descriptions on/off\n`;
    message += '\n';
  }

  // Make sure to reset any ANSI formatting at the end to prevent it from affecting the terminal
  message += RESET_COLOR;

  return {
    type: 'message',
    messageType: 'info',
    content: message,
  };
};

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

      // Pass the MCP server URL for OAuth discovery
      const mcpServerUrl = server.httpUrl || server.url;
      const authProvider = new MCPOAuthProvider(new MCPOAuthTokenStorage());
      await authProvider.authenticate(serverName, oauthConfig, mcpServerUrl);

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
  action: async (context: CommandContext, args: string) => {
    const lowerCaseArgs = args.toLowerCase().split(/\s+/).filter(Boolean);

    const hasDesc =
      lowerCaseArgs.includes('desc') || lowerCaseArgs.includes('descriptions');
    const hasNodesc =
      lowerCaseArgs.includes('nodesc') ||
      lowerCaseArgs.includes('nodescriptions');
    const showSchema = lowerCaseArgs.includes('schema');

    // Show descriptions if `desc` or `schema` is present,
    // but `nodesc` takes precedence and disables them.
    const showDescriptions = !hasNodesc && (hasDesc || showSchema);

    // Show tips only when no arguments are provided
    const showTips = lowerCaseArgs.length === 0;

    return getMcpStatus(context, showDescriptions, showSchema, showTips);
  },
};

const refreshCommand: SlashCommand = {
  name: 'refresh',
  description: 'Restarts MCP servers.',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
  ): Promise<SlashCommandActionReturn> => {
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

    return getMcpStatus(context, false, false, false);
  },
};

export const mcpCommand: SlashCommand = {
  name: 'mcp',
  description:
    'list configured MCP servers and tools, or authenticate with OAuth-enabled servers',
  kind: CommandKind.BUILT_IN,
  subCommands: [listCommand, authCommand, refreshCommand],
  // Default action when no subcommand is provided
  action: async (context: CommandContext, args: string) =>
    // If no subcommand, run the list command
    listCommand.action!(context, args),
};
