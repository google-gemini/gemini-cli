/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatDuration } from '../utils/formatters.js';
import { CommandKind, type SlashCommand } from './types.js';

export const newCommand: SlashCommand = {
  name: 'new',
  description:
    'Start a new session (current session is saved for later resume)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context) => {
    const now = Date.now();
    const { sessionStartTime } = context.session.stats;
    const wallDuration = now - sessionStartTime.getTime();

    return {
      type: 'new_session',
      messages: [
        {
          type: 'user',
          text: `/new`,
          id: now - 1,
        },
        {
          type: 'info',
          text: `Starting new session... Current session duration: ${formatDuration(wallDuration)}. Use /resume to return to this session.`,
          id: now,
        },
      ],
    };
  },
};
