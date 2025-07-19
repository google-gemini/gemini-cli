/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenDialogActionReturn, SlashCommandDefinition } from './types.js';

export const authCommand: SlashCommandDefinition = {
  name: 'auth',
  description: 'change the auth method',
  action: (_context, _args): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'auth',
  }),
};
