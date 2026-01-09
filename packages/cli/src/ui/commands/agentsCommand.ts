/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand, CommandContext } from './types.js';
import { CommandKind } from './types.js';
import { MessageType, type HistoryItemAgentsList } from '../types.js';

const agentsListCommand: SlashCommand = {
  name: 'list',
  description: 'List available local and remote agents',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    const { config } = context.services;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      };
    }

    const agentRegistry = config.getAgentRegistry();
    if (!agentRegistry) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Agent registry not found.',
      };
    }

    const agents = agentRegistry.getAllDefinitions().map((def) => ({
      name: def.name,
      displayName: def.displayName,
      description: def.description,
      kind: def.kind,
    }));

    const agentsListItem: HistoryItemAgentsList = {
      type: MessageType.AGENTS_LIST,
      agents,
    };

    context.ui.addItem(agentsListItem, Date.now());

    return;
  },
};

const agentsRefreshCommand: SlashCommand = {
  name: 'refresh',
  description: 'Reload the agent registry',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext) => {
    const { config } = context.services;
    const agentRegistry = config?.getAgentRegistry();
    if (!agentRegistry) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Agent registry not found.',
      };
    }

    await agentRegistry.reload();

    return {
      type: 'message',
      messageType: 'info',
      content: 'Agents refreshed successfully.',
    };
  },
};

export const agentsCommand: SlashCommand = {
  name: 'agents',
  description: 'Manage agents',
  kind: CommandKind.BUILT_IN,
  subCommands: [agentsListCommand, agentsRefreshCommand],
  action: async (context: CommandContext, args) =>
    // Default to list if no subcommand is provided
    agentsListCommand.action!(context, args),
};
