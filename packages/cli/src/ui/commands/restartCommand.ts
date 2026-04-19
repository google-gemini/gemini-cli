/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatDuration } from '../utils/formatters.js';
import { CommandKind, type SlashCommand } from './types.js';

export const restartCommand: SlashCommand = {
  name: 'restart',
  description: 'Restart the CLI process and resume the current session',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context) => {
    const now = Date.now();
    const { sessionStartTime } = context.session.stats;
    const wallDuration = now - sessionStartTime.getTime();

    const sessionId =
      context.services.agentContext?.config?.getSessionId() ?? undefined;

    return {
      type: 'restart',
      resumeSessionId: sessionId,
      messages: [
        {
          type: 'user',
          text: `/restart`,
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
