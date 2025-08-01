/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, MessageActionReturn, SlashCommand } from './types.js';
export const helpCommand: SlashCommand = {
  name: 'help',
  altNames: ['?'],
  description: 'for help on gemini-cli',
  kind: CommandKind.BUILT_IN,
  action: (context, _args): MessageActionReturn => {
    const commandList = context.commands;
    if (!commandList) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Could not load commands.',
      };
    }
    const helpText = commandList
      .map((cmd: SlashCommand) => `/${cmd.name} - ${cmd.description}`)
      .join('\n');
    return {
      type: 'message',
      messageType: 'info',
      content: `Available commands:\n${helpText}`,
    };
  },
};
