/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';

export const configCommand: SlashCommand = {
  name: 'config',
  description: 'Commands for interacting with the CLI configuration.',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'refresh',
      description: 'Reload settings and extensions from the filesystem.',
      kind: CommandKind.BUILT_IN,
      action: async (context): Promise<SlashCommandActionReturn> => {
        await context.ui.refreshConfig();
        return {
          type: 'message',
          messageType: 'info',
          content:
            'Configuration, extensions, memory, and tools have been refreshed.',
        };
      },
    },
  ],
};
