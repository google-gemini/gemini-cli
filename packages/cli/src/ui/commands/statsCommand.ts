/**
 * @license
 * Copyright 2025 Google LLC
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
import { t } from '../utils/i18n.js';

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

  const statsItem: HistoryItemStats = {
    type: MessageType.STATS,
    duration: formatDuration(wallDuration),
    selectedAuthType,
    userEmail,
    tier,
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
  get description() {
    return t('command.stats.description');
  },
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext) => {
    await defaultSessionView(context);
  },
  subCommands: [
    {
      name: 'session',
      get description() {
        return t('command.stats.session.description', {
          default: 'Show session-specific usage statistics',
        });
      },
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context: CommandContext) => {
        await defaultSessionView(context);
      },
    },
    {
      name: 'model',
      get description() {
        return t('command.stats.model.description', {
          default: 'Show model-specific usage statistics',
        });
      },
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: (context: CommandContext) => {
        const { selectedAuthType, userEmail, tier } = getUserIdentity(context);
        context.ui.addItem({
          type: MessageType.MODEL_STATS,
          selectedAuthType,
          userEmail,
          tier,
        } as HistoryItemModelStats);
      },
    },
    {
      name: 'tools',
      get description() {
        return t('command.stats.tools.description', {
          default: 'Show tool-specific usage statistics',
        });
      },
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
