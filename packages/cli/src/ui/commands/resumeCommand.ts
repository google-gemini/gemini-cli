/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  OpenDialogActionReturn,
  CommandContext,
  SlashCommand,
} from './types.js';
import { CommandKind } from './types.js';

export const resumeCommand: SlashCommand = {
  name: 'resume',
  description: 'Browse and resume auto-saved conversations',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (
    _context: CommandContext,
    _args: string,
  ): Promise<OpenDialogActionReturn> => ({
    type: 'dialog',
    dialog: 'sessionBrowser',
  }),
};
