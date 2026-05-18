/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';

const setAgentCommand: SlashCommand = {
  name: 'set',
  description:
    'Set the active agent to use. Usage: /agent set <agent-name> [--persist]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext, args: string) => {
    const parts = args.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'Usage: /agent set <agent-name> [--persist]',
      });
      return;
    }

    const agentName = parts[0];
    const persist = parts.includes('--persist');

    if (context.services.agentContext?.config) {
      if (agentName !== 'gemini-cli' && agentName !== 'gemini-enterprise') {
        context.ui.addItem({
          type: MessageType.ERROR,
          text: `Unknown agent: ${agentName}. Valid agents are 'gemini-cli' and 'gemini-enterprise'.`,
        });
        return;
      }

      context.services.agentContext.config.setAgent(agentName, !persist);

      context.ui.addItem({
        type: MessageType.INFO,
        text: `Agent set to ${agentName}${persist ? ' (persisted)' : ''}`,
      });
    }
  },
};

const manageAgentCommand: SlashCommand = {
  name: 'manage',
  description: 'Opens a dialog to select the agent',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    return {
      type: 'dialog',
      dialog: 'agent',
    };
  },
};

export const agentCommand: SlashCommand = {
  name: 'agent',
  description: 'Manage active AI agent configuration',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [manageAgentCommand, setAgentCommand],
  action: async (context: CommandContext, args: string) =>
    manageAgentCommand.action!(context, args),
};
