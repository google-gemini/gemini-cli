/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';

export const vimCommand: SlashCommand = {
  name: 'vim',
  description: 'Toggle vim mode on/off',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, _args) => {
    const newVimState = await context.ui.toggleVimEnabled();

    const message = newVimState
      ? 'Entered Vim mode. Run /vim again to exit.'
      : 'Exited Vim mode.';
    return {
      type: 'message',
      messageType: 'info',
      content: message,
    };
  },
};
