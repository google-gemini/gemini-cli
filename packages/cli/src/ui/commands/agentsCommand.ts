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
import { MessageType, type HistoryItemAgentsList } from '../types.js';
import type { AgentDefinition } from '@google/gemini-cli-core';

export const agentsCommand: SlashCommand = {
  name: 'agents',
  description: 'List all available agents and their capabilities',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext): Promise<void> => {
    const config = context.services.config;
    if (!config) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Configuration not available.',
        },
        Date.now(),
      );
      return;
    }

    const agentRegistry = config.getAgentRegistry();
    const agents = agentRegistry.getAllDefinitions();

    if (agents.length === 0) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: 'No agents are currently loaded.',
        },
        Date.now(),
      );
      return;
    }

    // Build agent list display
    const agentsListItem: HistoryItemAgentsList = {
      type: MessageType.AGENTS_LIST,
      agents: agents.map((agent: AgentDefinition) => {
        const metadata =
          (
            agent as AgentDefinition & {
              metadata?: { icon?: string; source?: string; filePath?: string };
            }
          ).metadata || {};
        const icon = metadata.icon || '🤖';
        const source = metadata.source || 'built-in';

        const toolsList = agent.toolConfig?.tools
          ? agent.toolConfig.tools
              .map((t) => (typeof t === 'string' ? t : t.name || 'unknown'))
              .join(', ')
          : 'none';

        const inputs = agent.inputConfig?.inputs
          ? Object.keys(agent.inputConfig.inputs).join(', ')
          : 'none';

        return {
          name: agent.name,
          displayName: agent.displayName || agent.name,
          description: agent.description,
          icon,
          source,
          model: agent.modelConfig.model,
          maxTimeMinutes: agent.runConfig.max_time_minutes,
          maxTurns: agent.runConfig.max_turns,
          tools: toolsList,
          inputs,
          filePath: metadata.filePath,
        };
      }),
    };

    context.ui.addItem(agentsListItem, Date.now());
  },
};
