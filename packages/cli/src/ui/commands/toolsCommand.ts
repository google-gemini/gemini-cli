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
  description: 'List available Gemini CLI tools. Usage: /tools [desc|schema]',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext, args?: string): Promise<void> => {
    const lowerCaseArgs = (args || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    const hasDesc =
      lowerCaseArgs.includes('desc') || lowerCaseArgs.includes('descriptions');
    const useShowSchema = lowerCaseArgs.includes('schema');

    // Show descriptions if `desc` or `schema` is present
    const useShowDescriptions = hasDesc || useShowSchema;

    const toolRegistry = context.services.config?.getToolRegistry();
    if (!toolRegistry) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Could not retrieve tool registry.',
        },
        Date.now(),
      );
      return;
    }

    const tools = toolRegistry.getAllTools();
    // Filter out MCP tools by checking for the absence of a serverName property
    const geminiTools = tools.filter((tool) => !('serverName' in tool));

    const toolsListItem: HistoryItemToolsList = {
      type: MessageType.TOOLS_LIST,
      tools: geminiTools.map((tool) => ({
        name: tool.name,
        displayName: tool.displayName,
        description: tool.description,
        schema: tool.schema,
      })),
      showDescriptions: useShowDescriptions,
      showSchema: useShowSchema,
    };

    context.ui.addItem(toolsListItem, Date.now());
  },
};
