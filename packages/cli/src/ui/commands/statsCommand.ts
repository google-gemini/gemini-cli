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
import { formatDistanceToNow } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

export const statsCommand: SlashCommand = {
  name: 'stats',
  altNames: ['usage'],
  description: 'Check session stats. Usage: /stats [model|tools]',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext) => {
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

    const wallDuration = now.getTime() - new Date(sessionStartTime).getTime();

    // New: Track requests with timestamps & model (increment this in generate commands — PR TODO)
    // Define interfaces for extended session types
    interface ExtendedStats {
      requestHistory?: Array<{ timestamp: number; model: string }>;
    }

    interface ExtendedSession {
      auth?: {
        plan?: string;
      };
    }

    // Use the interfaces instead of any
    const extendedStats = context.session.stats as ExtendedStats;
    const requestHistory = extendedStats.requestHistory ?? [];

    const extendedSession = context.session as ExtendedSession;
    const isPaid = extendedSession.auth?.plan === 'paid' || false;

    // Limits (2025 values — Pro paid higher, free lower for Pro)
    const limits = isPaid
      ? { perMinute: 100, daily: 1500, model: 'gemini-2.5-pro' } // Paid example
      : { perMinute: 60, daily: 1000, model: 'gemini-2.5-pro' }; // Free

    // Precise per-minute: count requests in last 60s
    const oneMinuteAgo = now.getTime() - 60_000;
    const perMinuteUsed = requestHistory.filter(
      (r) => r.timestamp > oneMinuteAgo,
    ).length;
    const perMinuteRemaining = limits.perMinute - perMinuteUsed;

    // Daily: count today's requests (midnight Pacific)
    const pacificToday = toZonedTime(now, 'America/Los_Angeles');
    pacificToday.setHours(0, 0, 0, 0);
    const todayStart = fromZonedTime(
      pacificToday,
      'America/Los_Angeles',
    ).getTime();
    const dailyUsed = requestHistory.filter(
      (r) => r.timestamp >= todayStart,
    ).length;
    const dailyRemaining = limits.daily - dailyUsed;

    // Reset times
    const minuteResetIn = formatDistanceToNow(
      new Date(oneMinuteAgo + 120_000),
      { addSuffix: true },
    ); // ~60s from oldest
    const dailyResetIn = formatDistanceToNow(
      new Date(todayStart + 24 * 60 * 60 * 1000),
      { addSuffix: true },
    );

    // Progress bar helper
    const progressBar = (used: number, total: number) => {
      const filled = Math.round((used / total) * 10);
      return `[${'█'.repeat(filled)}${' '.repeat(10 - filled)}] ${used}/${total}`;
    };

    let quotaDisplay = `Quota Usage (${isPaid ? 'Paid tier' : 'Free tier'}):\n`;
    quotaDisplay += `  Per minute: ${progressBar(perMinuteUsed, limits.perMinute)} (${perMinuteRemaining} remaining)\n`;
    quotaDisplay += `  Daily: ${progressBar(dailyUsed, limits.daily)} (${dailyRemaining} remaining)\n`;
    quotaDisplay += `  Resets: minute ${minuteResetIn} • daily ${dailyResetIn}`;
    if (isPaid)
      quotaDisplay += `\n  ✓ Unlimited high-priority access (fallback to Flash on spikes)`;

    // Add to statsItem + INFO (as before)
    const statsItem: HistoryItemStats & { quota?: string } = {
      type: MessageType.STATS,
      duration: formatDuration(wallDuration),
      quota: quotaDisplay,
    };

    context.ui.addItem(statsItem, Date.now());

    // Fallback display as INFO (renderer can use quota field in future)
    if (quotaDisplay) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: quotaDisplay, // Your multi-line quota string
        },
        Date.now() + 1, // Timestamp slightly later
      );
    }
  },
  subCommands: [
    {
      name: 'model',
      description: 'Show model-specific usage statistics',
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
      description: 'Show tool-specific usage statistics',
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
