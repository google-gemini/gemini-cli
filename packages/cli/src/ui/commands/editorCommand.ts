/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import i18n from 'i18next';
import {
  CommandKind,
  type OpenDialogActionReturn,
  type SlashCommand,
} from './types.js';

export const editorCommand: SlashCommand = {
  name: 'editor',
  get description() {
    return i18n.t('commands.editor.description', { ns: 'ui' });
  },
  kind: CommandKind.BUILT_IN,
  action: (): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'editor',
  }),
};
