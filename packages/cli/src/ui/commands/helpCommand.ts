/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenDialogActionReturn, SlashCommand } from './types.js';

export const helpCommand: SlashCommand = {
  name: 'help',
  altName: '?',
  description: 'for help on gemini-cli',
  action: (context, _args): OpenDialogActionReturn => {
    context.ui.setDebugMessage('Opening help.');
    return {
      type: 'dialog',
      dialog: 'help',
    };
  },
};
