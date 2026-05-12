/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getBuddyState,
  setBuddyVisible,
  toggleBuddy,
} from '../companion/BuddyState.js';
import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';

export const buddyCommand: SlashCommand = {
  name: 'buddy',
  description: 'Toggle Pollux, the gemini-code buddy.',
  kind: CommandKind.BUILT_IN,
  isSafeConcurrent: true,
  action: async (_context, args): Promise<SlashCommandActionReturn> => {
    const subcommand = args.trim().toLowerCase();

    if (subcommand === 'off') {
      setBuddyVisible(false);
      return {
        type: 'message',
        messageType: 'info',
        content: 'Pollux tucked away.',
      };
    }

    if (subcommand === 'status') {
      const buddy = getBuddyState();
      return {
        type: 'message',
        messageType: 'info',
        content: `Pollux is ${buddy.visible ? 'visible' : 'hidden'} · ${buddy.mood} · ${buddy.message}`,
      };
    }

    if (subcommand && subcommand !== 'on') {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Usage: /buddy [on|off|status]',
      };
    }

    const visible = subcommand === 'on' ? true : toggleBuddy();
    if (subcommand === 'on') {
      setBuddyVisible(true);
    }

    return {
      type: 'message',
      messageType: 'info',
      content: `Pollux ${visible ? 'online' : 'hidden'}.`,
    };
  },
};
