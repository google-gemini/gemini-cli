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

async function listTools(
  context: CommandContext,
  showDescriptions: boolean,
): Promise<void> {
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

  context.ui.addItem(toolsListItem);
}

const listSubCommand: SlashCommand = {
  name: 'list',
  description: 'List available Gemini CLI tools.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext): Promise<void> =>
    listTools(context, false),
};

const descSubCommand: SlashCommand = {
  name: 'desc',
  altNames: ['descriptions'],
  description: 'List available Gemini CLI tools with descriptions.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext): Promise<void> =>
    listTools(context, true),
};

export const toolsCommand: SlashCommand = {
  name: 'tools',
  description:
    'List available Gemini CLI tools. Use /tools desc to include descriptions.',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [listSubCommand, descSubCommand],
  action: async (context: CommandContext, args?: string): Promise<void> => {
    const subCommand = args?.trim();

    // Keep backward compatibility for typed arguments while exposing subcommands in TUI.
    const useShowDescriptions =
      subCommand === 'desc' || subCommand === 'descriptions';

    await listTools(context, useShowDescriptions);
  },
};
