/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType, type HistoryItemToolsList } from '../types.js';
import { DiscoveredMCPTool, DiscoveredTool } from '@google/gemini-cli-core';

export const toolsCommand: SlashCommand = {
  name: 'tools',
  description:
    'List available Gemini CLI tools. Use /tools desc to include descriptions.',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext, args?: string): Promise<void> => {
    const subCommand = args?.trim();

    // Default to NOT showing descriptions. The user must opt in with an argument.
    let useShowDescriptions = false;
    if (subCommand === 'desc' || subCommand === 'descriptions') {
      useShowDescriptions = true;
    }

    const toolRegistry = context.services.config?.getToolRegistry();
    if (!toolRegistry) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'Could not retrieve tool registry.',
      });
      return;
    }

    const tools = toolRegistry.getAllTools();

    const toolsListItem: HistoryItemToolsList = {
      type: MessageType.TOOLS_LIST,
      tools: tools.map((tool) => {
        let source: 'builtin' | 'extension' | 'mcp' | 'discovered' = 'builtin';
        let serverName: string | undefined;

        if (tool instanceof DiscoveredMCPTool) {
          source = 'mcp';
          serverName = tool.serverName;
        } else if (tool instanceof DiscoveredTool) {
          source = 'discovered';
        } else if (tool.extensionName) {
          source = 'extension';
        }

        return {
          name: tool.name,
          displayName: tool.displayName,
          description: tool.description,
          kind: tool.kind,
          isReadOnly: tool.isReadOnly,
          source,
          serverName,
        };
      }),
      showDescriptions: useShowDescriptions,
    };

    context.ui.addItem(toolsListItem);
  },
};
