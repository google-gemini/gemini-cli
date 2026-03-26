/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

export const btwCommand: SlashCommand = {
  name: 'btw',
  description: 'Ask a side question without affecting history (ephemeral)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  isSafeConcurrent: true,
  action: (context, args) => {
    const query = args.trim();
    if (!query) {
      return {
        type: 'command_output',
        value: [
          {
            text: 'Please provide a question, e.g. /btw what is this regex doing?',
          },
        ],
      };
    }

    return {
      type: 'btw',
      query,
    };
  },
};
