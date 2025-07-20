/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenDialogActionReturn, SlashCommand } from './types.js';

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'change the model',
  action: (_context, _args): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'model',
  }),
};