/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { t } from 'i18next';
import { CommandKind, OpenDialogActionReturn, SlashCommand } from './types.js';

export const privacyCommand: SlashCommand = {
  name: 'privacy',
  get description() {
    return t('commands.privacy.description', { ns: 'ui' });
  },
  kind: CommandKind.BUILT_IN,
  action: (): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'privacy',
  }),
};
