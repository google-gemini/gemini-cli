/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatDuration } from '../utils/formatters.js';
import { type SlashCommand } from './types.js';

export const quitCommand: SlashCommand = {
  name: 'quit',
  altName: 'exit',
  description: 'exit the cli',
  action: (context) => {
    const now = Date.now();
    const { sessionStartTime } = context.session.stats;
    const wallDuration = now - sessionStartTime.getTime();

    return {
      type: 'quit',
      messages: [
        {
          type: 'user',
          text: `/quit`, // Keep it consistent, even if /exit was used
          id: now - 1,
        },
        {
          type: 'quit',
          duration: formatDuration(wallDuration),
          id: now,
        },
      ],
    };
  },
};
