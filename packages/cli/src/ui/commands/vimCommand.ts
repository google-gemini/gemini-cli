/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand } from './types.js';
import { t } from 'i18next';

export const vimCommand: SlashCommand = {
  name: 'vim',
  get description() {
    return t('commands.vim.description', { ns: 'ui' });
  },
  kind: CommandKind.BUILT_IN,
  action: async (context, _args) => {
    const newVimState = await context.ui.toggleVimEnabled();

    const message = newVimState
      ? t('commands.vim.entered', { ns: 'ui' })
      : t('commands.vim.exited', { ns: 'ui' });
    return {
      type: 'message',
      messageType: 'info',
      content: message,
    };
  },
};
