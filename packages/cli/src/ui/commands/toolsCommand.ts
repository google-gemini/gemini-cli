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

export const toolsCommand: SlashCommand = {
  name: 'tools',
  description: 'List available Gemini CLI tools. Usage: /tools [desc|search]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext, args?: string): Promise<void> => {
    const subCommand = args?.trim();

    // Default to NOT showing descriptions. The user must opt in with an argument.
    let useShowDescriptions = false;
    let searchTerm = '';

    if (subCommand === 'desc' || subCommand === 'descriptions') {
      useShowDescriptions = true;
    } else if (subCommand) {
      searchTerm = subCommand.toLowerCase();
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
    // Filter out MCP tools by checking for the absence of a serverName property
    let geminiTools = tools.filter((tool) => !('serverName' in tool));

    if (searchTerm) {
      geminiTools = geminiTools.filter(
        (tool) =>
          tool.name.toLowerCase().includes(searchTerm) ||
          tool.displayName.toLowerCase().includes(searchTerm) ||
          tool.description.toLowerCase().includes(searchTerm),
      );
      // When searching, it's often more useful to see descriptions too.
      useShowDescriptions = true;
    }

    const toolsListItem: HistoryItemToolsList = {
      type: MessageType.TOOLS_LIST,
      tools: geminiTools.map((tool) => ({
        name: tool.name,
        displayName: tool.displayName,
        description: tool.description,
      })),
      showDescriptions: useShowDescriptions,
    };

    context.ui.addItem(toolsListItem);
  },
  completion: (context: CommandContext, partialArg: string) => {
    const toolRegistry = context.services.config?.getToolRegistry();
    const suggestions = ['desc', 'descriptions'];
    if (toolRegistry) {
      const tools = toolRegistry.getAllTools();
      const geminiTools = tools.filter((tool) => !('serverName' in tool));
      suggestions.push(...geminiTools.map((t) => t.name));
    }
    return suggestions.filter((s) => s.startsWith(partialArg));
  },
};
