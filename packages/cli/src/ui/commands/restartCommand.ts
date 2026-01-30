/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatDuration } from '../utils/formatters.js';
import { CommandKind, type SlashCommand } from './types.js';

export const restartCommand: SlashCommand = {
  name: 'restart',
  description: 'Restart the CLI and resume the current session',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context) => {
    const now = Date.now();
    const { sessionStartTime, sessionId } = context.session.stats;
    const wallDuration = now - sessionStartTime.getTime();

    return {
      type: 'restart',
      sessionId,
      messages: [
        {
          type: 'user',
          text: `/restart`,
          id: now - 1,
        },
        {
          type: 'info',
          text: `Restarting CLI... Session duration: ${formatDuration(wallDuration)}`,
          id: now,
        },
      ],
    };
  },
};
