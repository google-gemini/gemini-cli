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

    const agents = agentRegistry.getAllDefinitions().map((def) => {
      const base = {
        name: def.name,
        displayName: def.displayName,
        description: def.description,
        kind: def.kind,
      };

      if (def.kind === 'local') {
        const tools = def.toolConfig?.tools
          .map((t) => {
            if (typeof t === 'string') return t;
            return t.name;
          })
          .filter((t): t is string => t !== undefined);

        return {
          ...base,
          systemPrompt: def.promptConfig.systemPrompt,
          tools,
          maxTimeMinutes: def.runConfig.maxTimeMinutes,
          maxTurns: def.runConfig.maxTurns,
        };
      } else {
        return {
          ...base,
          agentCardUrl: def.agentCardUrl,
        };
      }
    });

    const agentsListItem: HistoryItemAgentsList = {
      type: MessageType.AGENTS_LIST,
      agents,
    };

    context.ui.addItem(agentsListItem);

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

const agentsDebugCommand: SlashCommand = {
  name: 'debug',
  description: "Debug why a sub agent isn't being called consistently",
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext, args: string) => {
    const { config } = context.services;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      };
    }

    if (!config.isAgentsEnabled()) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Agents are disabled.',
      };
    }

    const trimmedArgs = args.trim();
    if (!trimmedArgs) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Usage: /agent debug <agent-name> <problem-description>',
      };
    }

    const [agentName, ...problemParts] = trimmedArgs.split(' ');
    const problem = problemParts.join(' ');

    if (!problem) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Please provide a description of the problem or the failed prompt. Usage: /agent debug <agent-name> <problem-description>',
      };
    }

    const agentRegistry = config.getAgentRegistry();
    const agent = agentRegistry.getDefinition(agentName);

    if (!agent) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Agent '${agentName}' not found.`,
      };
    }

    let agentDefinition = `Name: ${agent.name}\n`;
    agentDefinition += `Description: ${agent.description}\n`;
    agentDefinition += `Kind: ${agent.kind}\n`;

    if (agent.kind === 'local') {
      agentDefinition += `System Prompt:\n${
        agent.promptConfig.systemPrompt || '(No system prompt)'
      }\n`;
      if (agent.promptConfig.query) {
        agentDefinition += `Query Template: ${agent.promptConfig.query}\n`;
      }
    }

    return {
      type: 'tool',
      toolName: 'delegate_to_agent',
      toolArgs: {
        agent_name: 'agent-debugger',
        target_agent_name: agentName,
        agent_definition: agentDefinition,
        problem_description: problem,
      },
    };
  },
};

export const agentsCommand: SlashCommand = {
  name: 'agents',
  altNames: ['agent'],
  description: 'Manage agents',
  kind: CommandKind.BUILT_IN,
  subCommands: [agentsListCommand, agentsRefreshCommand, agentsDebugCommand],
  action: async (context: CommandContext, args) =>
    // Default to list if no subcommand is provided
    agentsListCommand.action!(context, args),
};
