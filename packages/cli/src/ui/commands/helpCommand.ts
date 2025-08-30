/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand } from './types.js';
import { MessageType, type HistoryItemHelp } from '../types.js';
import i18n from '../../i18n/index.js';

export const helpCommand: SlashCommand = {
  name: 'help',
  altNames: ['?'],
  kind: CommandKind.BUILT_IN,
  get description() {
    return i18n.t('commands.help.description', { ns: 'ui' });
  },
  action: async (context) => {
    const currentLanguage = i18n.language as 'en' | 'zh' | 'fr' | 'es';
    const helpItem: Omit<HistoryItemHelp, 'id'> = {
      type: MessageType.HELP,
      timestamp: new Date(),
      language: currentLanguage,
    };

    context.ui.addItem(helpItem, Date.now());
  },
};
