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

const COLOR_GREEN = '\u001b[32m';
const COLOR_YELLOW = '\u001b[33m';
const COLOR_RED = '\u001b[31m';
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
  const discoveryState = getMCPDiscoveryState();

  let message = 'MCP Servers Status:\n\n';

  if (serverNames.length === 0) {
    message += 'No MCP servers configured.\n';
  } else {
    for (const serverName of serverNames) {
      const status =
        getMCPServerStatus(serverName) || MCPServerStatus.DISCONNECTED;
      const serverConfig = mcpServers[serverName];
      let serverId = '';
      if (serverConfig.command) {
        serverId = `${serverConfig.command} ${serverConfig.args?.join(' ') || ''}`;
      } else if (serverConfig.httpUrl) {
        serverId = serverConfig.httpUrl;
      } else if (serverConfig.url) {
        serverId = serverConfig.url;
      }

      const statusColor =
        status === MCPServerStatus.CONNECTED
          ? COLOR_GREEN
          : status === MCPServerStatus.CONNECTING
            ? COLOR_YELLOW
            : COLOR_RED;

      message += `📡 ${serverName} (${statusColor}${status}${RESET_COLOR})\n`;
      message += `  ID: ${serverId}\n`;

      const allTools = toolRegistry.getAllTools();
      const serverTools = allTools.filter(
        (tool) =>
          tool instanceof DiscoveredMCPTool && tool.serverName === serverName,
      ) as DiscoveredMCPTool[];

      if (serverTools.length > 0) {
        message += '  Tools:\n';
        serverTools.forEach((tool: DiscoveredMCPTool) => {
          message += `    - ${COLOR_CYAN}${tool.name}${RESET_COLOR}`;
          if ((showDescriptions || showSchema) && tool.description) {
            const descLines = tool.description.trim().split('\n');
            message += ':\n';
            for (const descLine of descLines) {
              message += `      ${COLOR_GREEN}${descLine}${RESET_COLOR}\n`;
            }
          } else {
            message += '\n';
          }

          if (showSchema) {
            message += `    ${COLOR_CYAN}Parameters:${RESET_COLOR}\n`;
            const paramsLines = JSON.stringify(tool.parameterSchema, null, 2)
              .trim()
              .split('\n');
            for (const paramsLine of paramsLines) {
              message += `      ${COLOR_GREEN}${paramsLine}${RESET_COLOR}\n`;
            }
          }
        });
      } else {
        message += '  No tools available\n';
      }
      message += '\n';
    }
  }

  const discoveryColor =
    discoveryState === MCPDiscoveryState.COMPLETED ? COLOR_GREEN : COLOR_YELLOW;
  message += `Discovery State: ${discoveryColor}${discoveryState}${RESET_COLOR}\n`;

  message += RESET_COLOR; // Final reset

  return {
    type: 'message',
    messageType: 'info',
    content: message,
  };
};

export const mcpCommand: SlashCommand = {
  name: 'mcp',
  description: 'list configured MCP servers and tools',
  action: (context: CommandContext) => getMcpStatus(context, false, false),
  subCommands: [
    {
      name: 'desc',
      altName: 'descriptions',
      description: 'Show detailed descriptions for MCP servers and tools.',
      action: (context: CommandContext) => getMcpStatus(context, true, false),
    },
    {
      name: 'nodesc',
      altName: 'nodescriptions',
      description: 'Hide tool descriptions, showing only the tool names.',
      action: (context: CommandContext) => getMcpStatus(context, false, false),
    },
    {
      name: 'schema',
      description: "Show the full JSON schema for the tool's parameters.",
      action: (context: CommandContext) => getMcpStatus(context, false, true),
    },
  ],
};
