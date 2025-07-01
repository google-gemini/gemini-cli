/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command, CommandContext, CommandArgs } from './types.js';

export const helpCommand: Command = {
  name: 'help',
  altName: '?',
  description: 'for help on gemini-cli',
  action: (context: CommandContext, _args: CommandArgs) => {
    context.utils.onDebugMessage('Opening help.');
    context.dialogs.setShowHelp(true);
  },
};
