/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType, HistoryItemStats } from '../types.js';
import { formatDuration } from '../utils/formatters.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';

export const statsCommand: SlashCommand = {
  name: 'stats',
  altNames: ['usage'],
  description: 'check session stats. Usage: /stats [model|tools]',
  kind: CommandKind.BUILT_IN,
  action: (context: CommandContext) => {
    const now = new Date();
    const { sessionStartTime } = context.session.stats;
    if (!sessionStartTime) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Session start time is unavailable, cannot calculate stats.',
        },
        Date.now(),
      );
      return;
    }
    const wallDuration = now.getTime() - sessionStartTime.getTime();

    const statsItem: HistoryItemStats = {
      type: MessageType.STATS,
      duration: formatDuration(wallDuration),
    };

    context.ui.addItem(statsItem, Date.now());
  },
  subCommands: [
    {
      name: 'model',
      description: 'Show model-specific usage statistics.',
      kind: CommandKind.BUILT_IN,
      action: (context: CommandContext) => {
        context.ui.addItem(
          {
            type: MessageType.MODEL_STATS,
          },
          Date.now(),
        );
      },
    },
    {
      name: 'tools',
      description: 'Show tool-specific usage statistics.',
      kind: CommandKind.BUILT_IN,
      action: (context: CommandContext) => {
        context.ui.addItem(
          {
            type: MessageType.TOOL_STATS,
          },
          Date.now(),
        );
      },
    },
  ],
};
