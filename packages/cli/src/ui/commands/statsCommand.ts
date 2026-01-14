/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HistoryItemStats } from '../types.js';
import { MessageType } from '../types.js';
import { formatDuration } from '../utils/formatters.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';

async function defaultSessionView(context: CommandContext) {
  const now = new Date();
  const { sessionStartTime } = context.session.stats;
  if (!sessionStartTime) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: 'Session start time is unavailable, cannot calculate stats.',
    });
    return;
  }
  const wallDuration = now.getTime() - sessionStartTime.getTime();

  const statsItem: HistoryItemStats = {
    type: MessageType.STATS,
    duration: formatDuration(wallDuration),
  };

  if (context.services.config) {
    const quota = await context.services.config.refreshUserQuota();
    if (quota) {
      statsItem.quotas = quota;
    }
  }

  context.ui.addItem(statsItem);
}

export const statsCommand: SlashCommand = {
  name: 'stats',
  altNames: ['usage'],
  description: 'Check session stats. Usage: /stats [session|model|tools]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext) => {
    await defaultSessionView(context);
  },
  subCommands: [
    {
      name: 'session',
      description: 'Show session-specific usage statistics',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context: CommandContext) => {
        await defaultSessionView(context);
      },
    },
    {
      name: 'model',
      description: 'Show model-specific usage statistics',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: (context: CommandContext) => {
        context.ui.addItem({
          type: MessageType.MODEL_STATS,
        });
      },
    },
    {
      name: 'tools',
      description: 'Show tool-specific usage statistics',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: (context: CommandContext) => {
        context.ui.addItem({
          type: MessageType.TOOL_STATS,
        });
      },
    },
  ],
};
