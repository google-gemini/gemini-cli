/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SlashCommand,
  SlashCommandActionReturn,
  CommandContext,
} from './types.js';
import {
  DiscoveredMCPTool,
  getMCPDiscoveryState,
  getMCPServerStatus,
  MCPDiscoveryState,
  MCPServerStatus,
} from '@google/gemini-cli-core';
import open from 'open';

const COLOR_GREEN = '\u001b[32m';
const COLOR_YELLOW = '\u001b[33m';
const COLOR_CYAN = '\u001b[36m';
const RESET_COLOR = '\u001b[0m';

const getMcpStatus = async (
  context: CommandContext,
  showDescriptions: boolean,
  showSchema: boolean,
): Promise<SlashCommandActionReturn> => {
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    };
  }

  const toolRegistry = await config.getToolRegistry();
  if (!toolRegistry) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Could not retrieve tool registry.',
    };
  }

  const mcpServers = config.getMcpServers() || {};
  const serverNames = Object.keys(mcpServers);

  if (serverNames.length === 0) {
    const docsUrl = 'https://goo.gle/gemini-cli-docs-mcp';
    if (process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec') {
      return {
        type: 'message',
        messageType: 'info',
        content: `No MCP servers configured. Please open the following URL in your browser to view documentation:\n${docsUrl}`,
      };
    } else {
      // Open the URL in the browser
      await open(docsUrl);
      return {
        type: 'message',
        messageType: 'info',
        content: `No MCP servers configured. Opening documentation in your browser: ${docsUrl}`,
      };
    }
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

  for (const serverName of serverNames) {
    const allTools = toolRegistry.getAllTools();
    const serverTools = allTools.filter(
      (tool) =>
        tool instanceof DiscoveredMCPTool && tool.serverName === serverName,
    ) as DiscoveredMCPTool[];

    const status = getMCPServerStatus(serverName);

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

    // Format server header with bold formatting and status
    message += `${statusIndicator} \u001b[1m${serverName}\u001b[0m - ${statusText}`;

    // Add tool count with conditional messaging
    if (status === MCPServerStatus.CONNECTED) {
      message += ` (${serverTools.length} tools)`;
    } else if (status === MCPServerStatus.CONNECTING) {
      message += ` (tools will appear when ready)`;
    } else {
      message += ` (${serverTools.length} tools cached)`;
    }

    // Add server description with proper handling of multi-line descriptions
    if ((showDescriptions || showSchema) && server?.description) {
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
      serverTools.forEach((tool) => {
        if ((showDescriptions || showSchema) && tool.description) {
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
        if (showSchema) {
          // Prefix the parameters in cyan
          message += `    ${COLOR_CYAN}Parameters:${RESET_COLOR}\n`;

          const paramsLines = JSON.stringify(tool.parameterSchema, null, 2)
            .trim()
            .split('\n');
          if (paramsLines) {
            for (const paramsLine of paramsLines) {
              message += `      ${COLOR_GREEN}${paramsLine}${RESET_COLOR}\n`;
            }
          }
        }
      });
    } else {
      message += '  No tools available\n';
    }
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

export const mcpCommand: SlashCommand = {
  name: 'mcp',
  description: 'list configured MCP servers and tools',
  action: async (context: CommandContext, args: string) => {
    // Check if the args includes a specific flag to control description visibility
    let useShowDescriptions = false;
    let useShowSchema = false;

    if (args) {
      const lowerCase = args.toLowerCase();
      if (lowerCase === 'desc' || lowerCase === 'descriptions') {
        useShowDescriptions = true;
      } else if (lowerCase === 'nodesc' || lowerCase === 'nodescriptions') {
        useShowDescriptions = false;
      } else if (lowerCase === 'schema') {
        useShowSchema = true;
      }
    }

    return getMcpStatus(context, useShowDescriptions, useShowSchema);
  },
};
