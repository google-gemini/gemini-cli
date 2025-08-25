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

export const installCommand: SlashCommand = {
  name: 'install',
  description: 'deprecated: use /theme install instead',
  kind: CommandKind.BUILT_IN,
  action: async (): Promise<SlashCommandActionReturn> => ({
    type: 'message',
    messageType: 'info',
    content:
      'The /install command is deprecated. Use /theme install <marketplace-url> to install themes.',
  }),
};
