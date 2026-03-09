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
    const subCommandName = args?.trim().split(' ')[0];

    // Find the subcommand, defaulting to 'list' if not found or not provided.
    const subCommandToRun =
      toolsCommand.subCommands?.find((cmd) => cmd.name === subCommandName) ??
      listSubCommand;

    // The action is guaranteed to exist on our own subcommand definitions.
    await subCommandToRun.action!(context, '');
  },
};
