/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandContext,
  SlashCommand,
  OpenDialogActionReturn,
} from './types.js';

export const resumeCommand: SlashCommand = {
  name: 'resume',
  description: 'Browse and resume auto-saved conversations',
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<OpenDialogActionReturn> => {
    return {
      type: 'dialog',
      dialog: 'sessionBrowser',
    };
  },
};