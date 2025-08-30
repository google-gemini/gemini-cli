/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import i18n from 'i18next';
import { CommandKind, OpenDialogActionReturn, SlashCommand } from './types.js';

export const privacyCommand: SlashCommand = {
  name: 'privacy',
  get description() {
    return i18n.t('commands.privacy.description', { ns: 'ui' });
  },
  kind: CommandKind.BUILT_IN,
  action: (): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'privacy',
  }),
};
