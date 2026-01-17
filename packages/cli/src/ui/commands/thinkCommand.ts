/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType } from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { THINKING_BUDGETS } from '../contexts/ThinkingModeContext.js';

function showCurrentSetting(context: CommandContext) {
  const { level, budget } = context.session.thinkingMode;
  const description = getThinkingDescription(level);

  context.ui.addItem({
    type: MessageType.INFO,
    text: `Current thinking mode: ${level} (${budget} tokens)\n${description}`,
  });
}

function getThinkingDescription(level: string): string {
  switch (level) {
    case 'off':
      return 'Extended thinking is disabled. The model will respond immediately without a planning phase.';
    case 'low':
      return 'Low thinking budget allows brief planning before responding.';
    case 'medium':
      return 'Medium thinking budget (default) allows moderate planning for complex tasks.';
    case 'high':
      return 'High thinking budget allows extensive planning for very complex reasoning tasks.';
    default:
      return '';
  }
}

function setThinkingLevel(
  context: CommandContext,
  level: 'off' | 'low' | 'medium' | 'high',
) {
  context.session.thinkingMode.setLevel(level);
  const budget = THINKING_BUDGETS[level];

  context.ui.addItem({
    type: MessageType.INFO,
    text: `Thinking mode set to: ${level} (${budget} tokens)`,
  });
}

export const thinkCommand: SlashCommand = {
  name: 'think',
  description:
    'Control extended thinking mode. Usage: /think [off|low|medium|high]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext) => {
    showCurrentSetting(context);
  },
  subCommands: [
    {
      name: 'off',
      description: 'Disable extended thinking (budget: 0 tokens)',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: (context: CommandContext) => {
        setThinkingLevel(context, 'off');
      },
    },
    {
      name: 'low',
      description: 'Set low thinking budget (2048 tokens)',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: (context: CommandContext) => {
        setThinkingLevel(context, 'low');
      },
    },
    {
      name: 'medium',
      description: 'Set medium thinking budget (8192 tokens) - Default',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: (context: CommandContext) => {
        setThinkingLevel(context, 'medium');
      },
    },
    {
      name: 'high',
      description: 'Set high thinking budget (24576 tokens)',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: (context: CommandContext) => {
        setThinkingLevel(context, 'high');
      },
    },
  ],
};
