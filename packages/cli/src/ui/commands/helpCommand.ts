/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { MessageType, type HistoryItemHelp } from '../types.js';
import { t } from '../utils/i18n.js';

export const helpCommand: SlashCommand = {
  name: 'help',
  kind: CommandKind.BUILT_IN,
  get description() {
    return t('command.help.description');
  },
  autoExecute: true,
  action: async (context) => {
    const helpItem: Omit<HistoryItemHelp, 'id'> = {
      type: MessageType.HELP,
      timestamp: new Date(),
    };

    context.ui.addItem(helpItem);
  },
};
