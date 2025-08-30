/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import i18n from 'i18next';
import { CommandKind, OpenDialogActionReturn, SlashCommand } from './types.js';

export const themeCommand: SlashCommand = {
  name: 'theme',
  get description() {
    return i18n.t('commands.theme.description', { ns: 'ui' });
  },
  kind: CommandKind.BUILT_IN,
  action: (_context, _args): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'theme',
  }),
};
