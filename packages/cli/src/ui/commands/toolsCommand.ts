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

const getToolsList = (context: CommandContext, showDescriptions: boolean) => {
  const toolRegistry = context.services.config?.getToolRegistry();
  if (!toolRegistry) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: 'Could not retrieve tool registry.',
    });
    return null;
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
    })),
    showDescriptions,
  };

  return toolsListItem;
};

const listSubCommand: SlashCommand = {
  name: 'list',
  description: 'List available Gemini CLI tools',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext): Promise<void> => {
    const item = getToolsList(context, false);
    if (item) {
      context.ui.addItem(item);
    }
  },
};

const descSubCommand: SlashCommand = {
  name: 'desc',
  description: 'List available Gemini CLI tools with descriptions',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext): Promise<void> => {
    const item = getToolsList(context, true);
    if (item) {
      context.ui.addItem(item);
    }
  },
};

export const toolsCommand: SlashCommand = {
  name: 'tools',
  description: 'List available Gemini CLI tools',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [listSubCommand, descSubCommand],
  action: async (context: CommandContext, args?: string): Promise<void> => {
    const subCommand = args?.trim();

    if (subCommand === 'desc') {
      const item = getToolsList(context, true);
      if (item) {
        context.ui.addItem(item);
      }
    } else if (!subCommand || subCommand === 'list') {
      const item = getToolsList(context, false);
      if (item) {
        context.ui.addItem(item);
      }
    } else {
      // For any other argument, default to list or let the UI handle it if it was a subcommand.
      // But since we want to be strict and simple:
      const item = getToolsList(context, false);
      if (item) {
        context.ui.addItem(item);
      }
    }
  },
};
