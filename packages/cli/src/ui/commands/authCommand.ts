/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, OpenDialogActionReturn, SlashCommand } from './types.js';

export const authCommand: SlashCommand = {
  name: 'auth',
  description: 'change the auth method',
  kind: CommandKind.BUILT_IN,
  action: (_context, _args): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'auth',
  }),
};
