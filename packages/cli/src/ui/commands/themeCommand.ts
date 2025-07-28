/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, OpenDialogActionReturn, SlashCommand } from './types.js';

export const themeCommand: SlashCommand = {
  name: 'theme',
  description: 'change the theme',
  kind: CommandKind.BUILT_IN,
  action: (_context): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'theme',
  }),
};
