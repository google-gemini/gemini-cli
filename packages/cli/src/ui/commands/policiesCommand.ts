/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';

const listPoliciesCommand: SlashCommand = {
  name: 'list',
  description: 'List all active policies',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    const { config } = context.services;
    if (!config) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Error: Config not available.',
        },
        Date.now(),
      );
      return;
    }

    const policyEngine = config.getPolicyEngine();
    const rules = policyEngine.getRules();

    if (rules.length === 0) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: 'No active policies.',
        },
        Date.now(),
      );
      return;
    }

    let content = '**Active Policies**\n\n';
    rules.forEach((rule, index) => {
      content += `${index + 1}. **${rule.decision.toUpperCase()}**`;
      if (rule.toolName) {
        content += ` tool: \`${rule.toolName}\``;
      } else {
        content += ` all tools`;
      }
      if (rule.argsPattern) {
        content += ` (args match: \`${rule.argsPattern.source}\`)`;
      }
      if (rule.priority !== undefined) {
        content += ` [Priority: ${rule.priority}]`;
      }
      content += '\n';
    });

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: content,
      },
      Date.now(),
    );
  },
};

export const policiesCommand: SlashCommand = {
  name: 'policies',
  description: 'Manage policies',
  kind: CommandKind.BUILT_IN,
  subCommands: [listPoliciesCommand],
};
