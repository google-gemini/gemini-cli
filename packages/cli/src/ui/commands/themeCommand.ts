/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenDialogActionReturn, SlashCommandDefinition } from './types.js';

export const themeCommand: SlashCommandDefinition = {
  name: 'theme',
  description: 'change the theme',
  action: (_context, _args): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'theme',
  }),
};
