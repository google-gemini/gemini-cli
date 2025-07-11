/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenDialogActionReturn, SlashCommand } from './types.js';

export const editorCommand: SlashCommand = {
  name: 'editor',
  description: 'set external editor preference',
  action: (_context, _args): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'editor',
  }),
};
