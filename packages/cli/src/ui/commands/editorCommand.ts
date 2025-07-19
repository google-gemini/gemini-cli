/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type OpenDialogActionReturn,
  type SlashCommandDefinition,
} from './types.js';

export const editorCommand: SlashCommandDefinition = {
  name: 'editor',
  description: 'set external editor preference',
  action: (): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'editor',
  }),
};
