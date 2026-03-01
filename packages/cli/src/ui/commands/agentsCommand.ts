/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SlashCommand,
  CommandContext,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import { MessageType, type HistoryItemAgentsList } from '../types.js';
import { SettingScope } from '../../config/settings.js';
import { disableAgent, enableAgent } from '../../utils/agentSettings.js';
import { renderAgentActionFeedback } from '../../utils/agentUtils.js';

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

    context.ui.addItem(agentsListItem);

    return;
  },
};

async function enableAction(
  context: CommandContext,
  args: string,
): Promise<SlashCommandActionReturn | void> {
  const { config, settings } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    };
  }

  const agentName = args.trim();
  if (!agentName) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Usage: /agents enable <agent-name>',
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

  const allAgents = agentRegistry.getAllAgentNames();
  const overrides = settings.merged.agents.overrides;
  const disabledAgents = Object.keys(overrides).filter(
    (name) => overrides[name]?.enabled === false,
  );

  if (allAgents.includes(agentName) && !disabledAgents.includes(agentName)) {
    return {
      type: 'message',
      messageType: 'info',
      content: `Agent '${agentName}' is already enabled.`,
    };
  }

  if (!disabledAgents.includes(agentName) && !allAgents.includes(agentName)) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Agent '${agentName}' not found.`,
    };
  }

  const result = enableAgent(settings, agentName);

  if (result.status === 'no-op') {
    return {
      type: 'message',
      messageType: 'info',
      content: renderAgentActionFeedback(result, (l, p) => `${l} (${p})`),
    };
  }

  context.ui.addItem({
    type: MessageType.INFO,
    text: `Enabling ${agentName}...`,
  });
  await agentRegistry.reload();

  return {
    type: 'message',
    messageType: 'info',
    content: renderAgentActionFeedback(result, (l, p) => `${l} (${p})`),
  };
}

async function disableAction(
  context: CommandContext,
  args: string,
): Promise<SlashCommandActionReturn | void> {
  const { config, settings } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    };
  }

  const agentName = args.trim();
  if (!agentName) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Usage: /agents disable <agent-name>',
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

  const allAgents = agentRegistry.getAllAgentNames();
  const overrides = settings.merged.agents.overrides;
  const disabledAgents = Object.keys(overrides).filter(
    (name) => overrides[name]?.enabled === false,
  );

  if (disabledAgents.includes(agentName)) {
    return {
      type: 'message',
      messageType: 'info',
      content: `Agent '${agentName}' is already disabled.`,
    };
  }

  if (!allAgents.includes(agentName)) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Agent '${agentName}' not found.`,
    };
  }

  const scope = context.services.settings.workspace.path
    ? SettingScope.Workspace
    : SettingScope.User;
  const result = disableAgent(settings, agentName, scope);

  if (result.status === 'no-op') {
    return {
      type: 'message',
      messageType: 'info',
      content: renderAgentActionFeedback(result, (l, p) => `${l} (${p})`),
    };
  }

  context.ui.addItem({
    type: MessageType.INFO,
    text: `Disabling ${agentName}...`,
  });
  await agentRegistry.reload();

  return {
    type: 'message',
    messageType: 'info',
    content: renderAgentActionFeedback(result, (l, p) => `${l} (${p})`),
  };
}

async function configAction(
  context: CommandContext,
  args: string,
): Promise<SlashCommandActionReturn | void> {
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    };
  }

  const agentName = args.trim();
  if (!agentName) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Usage: /agents config <agent-name>',
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

  const definition = agentRegistry.getDiscoveredDefinition(agentName);
  if (!definition) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Agent '${agentName}' not found.`,
    };
  }

  const displayName = definition.displayName || agentName;

  return {
    type: 'dialog',
    dialog: 'agentConfig',
    props: {
      name: agentName,
      displayName,
      definition,
    },
  };
}

function completeAgentsToEnable(context: CommandContext, partialArg: string) {
  const { config, settings } = context.services;
  if (!config) return [];

  const overrides = settings.merged.agents.overrides;
  const disabledAgents = Object.entries(overrides)
    .filter(([_, override]) => override?.enabled === false)
    .map(([name]) => name);

  return disabledAgents.filter((name) => name.startsWith(partialArg));
}

function completeAgentsToDisable(context: CommandContext, partialArg: string) {
  const { config } = context.services;
  if (!config) return [];

  const agentRegistry = config.getAgentRegistry();
  const allAgents = agentRegistry ? agentRegistry.getAllAgentNames() : [];
  return allAgents.filter((name: string) => name.startsWith(partialArg));
}

function completeAllAgents(context: CommandContext, partialArg: string) {
  const { config } = context.services;
  if (!config) return [];

  const agentRegistry = config.getAgentRegistry();
  const allAgents = agentRegistry?.getAllDiscoveredAgentNames() ?? [];
  return allAgents.filter((name: string) => name.startsWith(partialArg));
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

const configCommand: SlashCommand = {
  name: 'config',
  description: 'Configure an agent',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: configAction,
  completion: completeAllAgents,
};

const agentsRefreshCommand: SlashCommand = {
  name: 'refresh',
  altNames: ['reload'],
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

    context.ui.addItem({
      type: MessageType.INFO,
      text: 'Refreshing agent registry...',
    });

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
  subCommands: [
    agentsListCommand,
    agentsRefreshCommand,
    enableCommand,
    disableCommand,
    configCommand,
  ],
  action: async (context: CommandContext, args) =>
    // Default to list if no subcommand is provided
    agentsListCommand.action!(context, args),
};
