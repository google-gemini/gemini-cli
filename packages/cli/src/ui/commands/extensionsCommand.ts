/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type CommandContext, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';

export const extensionsCommand: SlashCommand = {
  name: 'extensions',
  description: 'list active extensions',
  action: async (context: CommandContext): Promise<void> => {
    const activeExtensions = context.services.config?.getActiveExtensions();
    if (!activeExtensions || activeExtensions.length === 0) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: 'No active extensions.',
        },
        Date.now(),
      );
      return;
    }

    let message = 'Active extensions:\n\n';
    for (const ext of activeExtensions) {
      const stripAnsi = (str: string) => str.replace(/[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
      const name = stripAnsi(ext.name);
      const version = stripAnsi(ext.version);
      message += `  - \u001b[36m${name} (v${version})\u001b[0m\n`;
    }
    // Make sure to reset any ANSI formatting at the end to prevent it from affecting the terminal
    message += '\u001b[0m';

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: message,
      },
      Date.now(),
    );
  },
};
