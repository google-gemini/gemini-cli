/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand } from './types.js';

export const helpCommand: SlashCommand = {
  name: 'help',
  altName: '?',
  description: 'for help on gemini-cli',
  action: (context, _args) => {
    context.ui.setDebugMessage('Opening help.');
    context.dialogs.openHelp();
  },
};
