/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  HistoryItemStats,
  HistoryItemModelStats,
  HistoryItemToolStats,
} from '../types.js';
import { MessageType } from '../types.js';
import { formatDuration } from '../utils/formatters.js';
import { UserAccountManager } from '@google/gemini-cli-core';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';

function getUserIdentity(context: CommandContext) {
  const selectedAuthType =
    context.services.settings.merged.security.auth.selectedType || '';

  const userAccountManager = new UserAccountManager();
  const cachedAccount = userAccountManager.getCachedGoogleAccount();
  const userEmail = cachedAccount ?? undefined;

  const tier = context.services.config?.getUserTierName();

  return { selectedAuthType, userEmail, tier };
}

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

  const { selectedAuthType, userEmail, tier } = getUserIdentity(context);
  const currentModel = context.services.config?.getModel();

  const statsItem: HistoryItemStats = {
    type: MessageType.STATS,
    duration: formatDuration(wallDuration),
    selectedAuthType,
    userEmail,
    tier,
    currentModel,
  };

  if (context.services.config) {
    const quota = await context.services.config.refreshUserQuota();
    if (quota) {
      statsItem.quotas = quota;
      statsItem.pooledRemaining = context.services.config.getQuotaRemaining();
      statsItem.pooledLimit = context.services.config.getQuotaLimit();
      statsItem.pooledResetTime = context.services.config.getQuotaResetTime();
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
        const { selectedAuthType, userEmail, tier } = getUserIdentity(context);
        const currentModel = context.services.config?.getModel();
        const pooledRemaining = context.services.config?.getQuotaRemaining();
        const pooledLimit = context.services.config?.getQuotaLimit();
        const pooledResetTime = context.services.config?.getQuotaResetTime();
        context.ui.addItem({
          type: MessageType.MODEL_STATS,
          selectedAuthType,
          userEmail,
          tier,
          currentModel,
          pooledRemaining,
          pooledLimit,
          pooledResetTime,
        } as HistoryItemModelStats);
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
        } as HistoryItemToolStats);
      },
    },
  ],
};
