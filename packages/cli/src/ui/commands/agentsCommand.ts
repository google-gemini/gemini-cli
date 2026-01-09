/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand, CommandContext } from './types.js';
import { CommandKind } from './types.js';
import { MessageType, type HistoryItemAgentsList } from '../types.js';
import { SettingScope } from '../../config/settings.js';

async function enableAction(context: CommandContext, args: string) {
  const { config, settings } = context.services;
  if (!config) return;

  const agentName = args.trim();
  if (!agentName) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Usage: /agents enable <agent-name>',
      },
      Date.now(),
    );
    return;
  }

  const currentDisabled = settings.merged.agents?.disabled ?? [];
  const newDisabled = currentDisabled.filter((name) => name !== agentName);
  settings.setValue(SettingScope.User, 'agents.disabled', newDisabled);
  await config.reloadAgents();

  context.ui.addItem(
    {
      type: MessageType.INFO,
      text: `Agent '${agentName}' enabled.`,
    },
    Date.now(),
  );
}

async function disableAction(context: CommandContext, args: string) {
  const { config, settings } = context.services;
  if (!config) return;

  const agentName = args.trim();
  if (!agentName) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Usage: /agents disable <agent-name>',
      },
      Date.now(),
    );
    return;
  }

  const currentDisabled = settings.merged.agents?.disabled ?? [];
  if (!currentDisabled.includes(agentName)) {
    const newDisabled = [...currentDisabled, agentName];
    settings.setValue(SettingScope.User, 'agents.disabled', newDisabled);
    await config.reloadAgents();
  }

  context.ui.addItem(
    {
      type: MessageType.INFO,
      text: `Agent '${agentName}' disabled.`,
    },
    Date.now(),
  );
}

function completeAgentsToEnable(context: CommandContext, partialArg: string) {
  const { config, settings } = context.services;
  if (!config) return [];

  const disabledAgents = settings.merged.agents?.disabled ?? [];
  return disabledAgents.filter((name) => name.startsWith(partialArg));
}

function completeAgentsToDisable(context: CommandContext, partialArg: string) {
  const { config } = context.services;
  if (!config) return [];

  const agentRegistry = config.getAgentRegistry();
  const allAgents = agentRegistry ? agentRegistry.getAllAgentNames() : [];
  return allAgents.filter((name) => name.startsWith(partialArg));
}

const enableCommand: SlashCommand = {
  name: 'enable',
  description: 'Enable a disabled agent',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: enableAction,
  completion: completeAgentsToEnable,
};

const disableCommand: SlashCommand = {
  name: 'disable',
  description: 'Disable an enabled agent',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: disableAction,
  completion: completeAgentsToDisable,
};

export const agentsCommand: SlashCommand = {
  name: 'agents',
  description: 'List available local and remote agents',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  subCommands: [enableCommand, disableCommand],
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
