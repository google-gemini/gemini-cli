/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SlashCommand,
  SlashCommandActionReturn,
  CommandContext,
  CommandKind,
  MessageActionReturn,
} from './types.js';
import i18n from '../../i18n/index.js';
import {
  DiscoveredMCPPrompt,
  DiscoveredMCPTool,
  getMCPDiscoveryState,
  getMCPServerStatus,
  MCPDiscoveryState,
  MCPServerStatus,
  mcpServerRequiresOAuth,
  getErrorMessage,
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
      content: i18n.t('mcp.configNotLoaded', { ns: 'commands' }),
    };
  }

  const toolRegistry = config.getToolRegistry();
  if (!toolRegistry) {
    return {
      type: 'message',
      messageType: 'error',
      content: i18n.t('mcp.toolRegistryError', { ns: 'commands' }),
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
      content: i18n.t('mcp.noServersConfigured', { docsUrl, ns: 'commands' }),
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
    message += `${COLOR_YELLOW}⏳ ${i18n.t('mcp.serversStartingUp', { count: connectingServers.length, ns: 'commands' })}${RESET_COLOR}\n`;
    message += `${COLOR_CYAN}${i18n.t('mcp.firstStartupNote', { ns: 'commands' })}${RESET_COLOR}\n\n`;
  }

  message += `${i18n.t('mcp.configuredServers', { ns: 'commands' })}\n\n`;

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
        statusText = i18n.t('mcp.serverStatus.ready', { ns: 'commands' });
        break;
      case MCPServerStatus.CONNECTING:
        statusIndicator = '🔄';
        statusText = i18n.t('mcp.serverStatus.starting', { ns: 'commands' });
        break;
      case MCPServerStatus.DISCONNECTED:
      default:
        statusIndicator = '🔴';
        statusText = i18n.t('mcp.serverStatus.disconnected', { ns: 'commands' });
        break;
    }

    // Get server description if available
    const server = mcpServers[serverName];
    let serverDisplayName = serverName;
    if (server.extensionName) {
      serverDisplayName += ` ${i18n.t('mcp.serverExtension', { extensionName: server.extensionName, ns: 'commands' })}`;
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
        const hasToken = await MCPOAuthTokenStorage.getToken(serverName);
        if (hasToken) {
          const isExpired = MCPOAuthTokenStorage.isTokenExpired(hasToken.token);
          if (isExpired) {
            message += ` ${COLOR_YELLOW}${i18n.t('mcp.oauthStatus.tokenExpired', { ns: 'commands' })}${RESET_COLOR}`;
          } else {
            message += ` ${COLOR_GREEN}${i18n.t('mcp.oauthStatus.authenticated', { ns: 'commands' })}${RESET_COLOR}`;
            needsAuthHint = false;
          }
        } else {
          message += ` ${COLOR_RED}${i18n.t('mcp.oauthStatus.notAuthenticated', { ns: 'commands' })}${RESET_COLOR}`;
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
          i18n.t('mcp.toolCount', { count: serverTools.length, ns: 'commands' }),
        );
      }
      if (serverPrompts.length > 0) {
        parts.push(
          i18n.t('mcp.promptCount', { count: serverPrompts.length, ns: 'commands' }),
        );
      }
      if (parts.length > 0) {
        message += ` (${parts.join(', ')})`;
      } else {
        message += ` (${i18n.t('mcp.noTools', { ns: 'commands' })})`;
      }
    } else if (status === MCPServerStatus.CONNECTING) {
      message += ` (${i18n.t('mcp.toolsWillAppear', { ns: 'commands' })})`;
    } else {
      message += ` (${i18n.t('mcp.toolsCached', { count: serverTools.length, ns: 'commands' })})`;
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
      message += `  ${COLOR_CYAN}${i18n.t('mcp.sections.tools', { ns: 'commands' })}${RESET_COLOR}\n`;
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
          message += `    ${COLOR_CYAN}${i18n.t('mcp.sections.parameters', { ns: 'commands' })}${RESET_COLOR}\n`;

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
      message += `  ${COLOR_CYAN}${i18n.t('mcp.sections.prompts', { ns: 'commands' })}${RESET_COLOR}\n`;
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
      message += `  ${i18n.t('mcp.noToolsOrPrompts', { ns: 'commands' })}\n`;
    } else if (serverTools.length === 0) {
      message += `  ${i18n.t('mcp.noToolsAvailable', { ns: 'commands' })}`;
      if (originalStatus === MCPServerStatus.DISCONNECTED && needsAuthHint) {
        message += ` ${COLOR_GREY}${i18n.t('mcp.authHint', { serverName, ns: 'commands' })}${RESET_COLOR}`;
      }
      message += '\n';
    } else if (
      originalStatus === MCPServerStatus.DISCONNECTED &&
      needsAuthHint
    ) {
      // This case is for when serverTools.length > 0
      message += `  ${COLOR_GREY}${i18n.t('mcp.authHint', { serverName, ns: 'commands' })}${RESET_COLOR}\n`;
    }
    message += '\n';
  }

  for (const server of blockedMcpServers) {
    let serverDisplayName = server.name;
    if (server.extensionName) {
      serverDisplayName += ` ${i18n.t('mcp.serverExtension', { extensionName: server.extensionName, ns: 'commands' })}`;
    }
    message += `🔴 \u001b[1m${serverDisplayName}\u001b[0m - ${i18n.t('mcp.serverBlocked', { ns: 'commands' })}\n\n`;
  }

  // Add helpful tips when no arguments are provided
  if (showTips) {
    message += '\n';
    message += `${COLOR_CYAN}${i18n.t('mcp.tips.title', { ns: 'commands' })}${RESET_COLOR}\n`;
    message += `  • ${i18n.t('mcp.tips.showDescriptions', { command: `${COLOR_CYAN}/mcp desc${RESET_COLOR}`, ns: 'commands' })}\n`;
    message += `  • ${i18n.t('mcp.tips.showSchema', { command: `${COLOR_CYAN}/mcp schema${RESET_COLOR}`, ns: 'commands' })}\n`;
    message += `  • ${i18n.t('mcp.tips.hideDescriptions', { command: `${COLOR_CYAN}/mcp nodesc${RESET_COLOR}`, ns: 'commands' })}\n`;
    message += `  • ${i18n.t('mcp.tips.authenticate', { command: `${COLOR_CYAN}/mcp auth <server-name>${RESET_COLOR}`, ns: 'commands' })}\n`;
    message += `  • ${i18n.t('mcp.tips.toggleDescriptions', { key: `${COLOR_CYAN}Ctrl+T${RESET_COLOR}`, ns: 'commands' })}\n`;
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
  get description() {
    return i18n.t('mcp.auth', { ns: 'commands' });
  },
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
        content: i18n.t('mcp.configNotLoaded', { ns: 'commands' }),
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
          content: i18n.t('mcp.authDetails.noOAuthServers', { ns: 'commands' }),
        };
      }

      const serverList = oauthServers.map((s) => `  - ${s}`).join('\n');
      return {
        type: 'message',
        messageType: 'info',
        content: i18n.t('mcp.authDetails.oauthServersList', { servers: serverList, ns: 'commands' }),
      };
    }

    const server = mcpServers[serverName];
    if (!server) {
      return {
        type: 'message',
        messageType: 'error',
        content: i18n.t('mcp.authDetails.serverNotFound', { serverName, ns: 'commands' }),
      };
    }

    // Always attempt OAuth authentication, even if not explicitly configured
    // The authentication process will discover OAuth requirements automatically

    try {
      context.ui.addItem(
        {
          type: 'info',
          text: i18n.t('mcp.authDetails.startingAuth', { serverName, ns: 'commands' }),
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
      await MCPOAuthProvider.authenticate(
        serverName,
        oauthConfig,
        mcpServerUrl,
      );

      context.ui.addItem(
        {
          type: 'info',
          text: i18n.t('mcp.authDetails.authSuccess', { serverName, ns: 'commands' }),
        },
        Date.now(),
      );

      // Trigger tool re-discovery to pick up authenticated server
      const toolRegistry = config.getToolRegistry();
      if (toolRegistry) {
        context.ui.addItem(
          {
            type: 'info',
            text: i18n.t('mcp.authDetails.rediscoveringTools', { serverName, ns: 'commands' }),
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
        content: i18n.t('mcp.authDetails.refreshSuccess', { serverName, ns: 'commands' }),
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: i18n.t('mcp.authFailed', { serverName, error: getErrorMessage(error), ns: 'commands' }),
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
  get description() {
    return i18n.t('mcp.list', { ns: 'commands' });
  },
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
  get description() {
    return i18n.t('mcp.refresh', { ns: 'commands' });
  },
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
  ): Promise<SlashCommandActionReturn> => {
    const { config } = context.services;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: i18n.t('mcp.configNotLoaded', { ns: 'commands' }),
      };
    }

    const toolRegistry = config.getToolRegistry();
    if (!toolRegistry) {
      return {
        type: 'message',
        messageType: 'error',
        content: i18n.t('mcp.toolRegistryError', { ns: 'commands' }),
      };
    }

    context.ui.addItem(
      {
        type: 'info',
        text: i18n.t('mcp.refreshDetails.restarting', { ns: 'commands' }),
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
  get description() {
    return i18n.t('mcp.description', { ns: 'commands' });
  },
  kind: CommandKind.BUILT_IN,
  subCommands: [listCommand, authCommand, refreshCommand],
  // Default action when no subcommand is provided
  action: async (context: CommandContext, args: string) =>
    // If no subcommand, run the list command
    listCommand.action!(context, args),
};
