/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { MessageType, type HistoryItemWhoami } from '../types.js';
import { UserAccountManager, debugLogger } from '@google/gemini-cli-core';

export const whoamiCommand: SlashCommand = {
  name: 'whoami',
  description: 'Show current identity',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const userAccountManager = new UserAccountManager();
    const cachedAccount = userAccountManager.getCachedGoogleAccount();
    debugLogger.log('WhoamiCommand: Retrieved cached Google account', {
      cachedAccount,
    });
    const userEmail = cachedAccount ?? undefined;
    const selectedAuthType =
      context.services.settings.merged.security?.auth?.selectedType || '';

    const whoamiItem: Omit<HistoryItemWhoami, 'id'> = {
      type: MessageType.WHOAMI,
      selectedAuthType,
      userEmail,
    };

    context.ui.addItem(whoamiItem, Date.now());
  },
};
