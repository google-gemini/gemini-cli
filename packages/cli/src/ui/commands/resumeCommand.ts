/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandContext,
  SlashCommand,
  OpenDialogActionReturn,
  CommandKind,
} from './types.js';

export const resumeCommand: SlashCommand = {
  name: 'resume',
  description: 'Browse and resume auto-saved conversations',
  kind: CommandKind.BUILT_IN,
  action: async (
    _context: CommandContext,
    _args: string,
  ): Promise<OpenDialogActionReturn> => {
    return {
      type: 'dialog',
      dialog: 'sessionBrowser',
    };
  },
};
