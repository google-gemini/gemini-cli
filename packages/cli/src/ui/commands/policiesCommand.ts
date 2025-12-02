/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';

import { TOOL_DISPLAY_NAMES } from '../../../../core/src/tools/tool-names.js';

const listPoliciesCommand: SlashCommand = {
  name: 'list',
  description: 'List all active policies',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
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
        if (rule.toolName.endsWith('__*')) {
          const serverName = rule.toolName.slice(0, -3);
          content += ` all tools for server \`${serverName}\``;
        } else {
          const displayName =
            TOOL_DISPLAY_NAMES[rule.toolName] || rule.toolName;
          content += ` tool: \`${displayName}\``;
        }
      } else {
        content += ` all tools`;
      }
      if (rule.argsPattern) {
        let friendlyArgs = rule.argsPattern.source;
        // We use a simpler match to be robust against variations in escaping
        const shellPatternRegex = /"command".*?\(\?:([^)]+)\)/;
        const shellMatch = friendlyArgs.match(shellPatternRegex);
        if (shellMatch) {
          const commands = shellMatch[1]
            .split('|')
            .map((c) => c.replace(/\\/g, '')); // unescape
          friendlyArgs = `command: ${commands.join(', ')}`;
        } else {
          // Try to match simple string match: "command":"cmd
          const simpleMatch = friendlyArgs.match(/"command":"([^"]+)/);
          if (simpleMatch) {
            friendlyArgs = `command starts with "${simpleMatch[1]}"`;
          }
        }
        content += ` (${friendlyArgs})`;
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
  autoExecute: false,
  subCommands: [listPoliciesCommand],
};
