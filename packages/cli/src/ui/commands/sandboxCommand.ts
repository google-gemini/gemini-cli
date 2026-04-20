/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';
import { SandboxWizard } from '../components/sandbox/SandboxWizard.js';

const setupSubcommand: SlashCommand = {
  name: 'setup',
  description: 'Launch the interactive sandbox security policy wizard',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context) => ({
    type: 'custom_dialog' as const,
    component: React.createElement(SandboxWizard, {
      onComplete: () => {
        context.ui.removeComponent();
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: 'Sandbox policy saved successfully.',
          },
          Date.now(),
        );
      },
      onCancel: () => {
        context.ui.removeComponent();
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: 'Sandbox setup cancelled.',
          },
          Date.now(),
        );
      },
      config: context.services.config,
    }),
  }),
};

const statusSubcommand: SlashCommand = {
  name: 'status',
  description: 'Show current sandbox and policy status',
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

    const toolDecisions = new Map<string, string>();
    for (const rule of rules) {
      if (rule.toolName && !toolDecisions.has(rule.toolName)) {
        toolDecisions.set(rule.toolName, rule.decision.toUpperCase());
      }
    }

    let content = '**Sandbox Status**\n\n';
    content += `**Active Rules:** ${rules.length}\n\n`;

    if (toolDecisions.size > 0) {
      content += '| Tool | Decision |\n|------|----------|\n';
      for (const [tool, decision] of toolDecisions) {
        content += `| \`${tool}\` | ${decision} |\n`;
      }
    } else {
      content += '_No active policies configured._\n';
    }

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: content,
      },
      Date.now(),
    );
  },
};

export const sandboxCommand: SlashCommand = {
  name: 'sandbox',
  description: 'Manage sandbox security policies',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [setupSubcommand, statusSubcommand],
};
