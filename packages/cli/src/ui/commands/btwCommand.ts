/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

export const btwCommand: SlashCommand = {
  name: 'btw',
  description: 'Ask an isolated side question without changing the main chat',
  kind: CommandKind.BUILT_IN,
  isSafeConcurrent: true,
  shouldAddToHistory: false,
  action: async (_context, args) => {
    const prompt = args.trim();
    if (!prompt) {
      return {
        type: 'message' as const,
        messageType: 'error' as const,
        content: 'Usage: /btw <side question>',
      };
    }

    return {
      type: 'btw' as const,
      prompt,
    };
  },
};
