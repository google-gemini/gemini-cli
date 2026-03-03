/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatDuration } from '../utils/formatters.js';
import { startupProfiler } from '@google/gemini-cli-core';
import { CommandKind, type SlashCommand } from './types.js';

export const quitCommand: SlashCommand = {
  name: 'quit',
  altNames: ['exit'],
  description: 'Exit the cli',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context) => {
    const now = Date.now();
    const { sessionStartTime } = context.session.stats;
    const wallDuration = now - sessionStartTime.getTime();
    const startupPhases = startupProfiler
      .getLastStartupStats()
      .map((phase) => ({
        name: phase.name,
        durationMs: phase.duration_ms,
      }));

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
          wallTimeMs: wallDuration,
          startupPhases: startupPhases.length > 0 ? startupPhases : undefined,
          id: now,
        },
      ],
    };
  },
};
