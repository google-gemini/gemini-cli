/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, MessageActionReturn, SlashCommand } from './types.js';
import { formatHelpContent } from '../utils/formatHelpContent.js';

export const helpCommand: SlashCommand = {
  name: 'help',
  altNames: ['?'],
  description: 'for help on gemini-cli',
  kind: CommandKind.BUILT_IN,
  action: (context, _args): MessageActionReturn => {
    const helpContent = formatHelpContent(context.slashCommands);
    return {
      type: 'message',
      messageType: 'help',
      content: helpContent,
    };
  },
};
