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
import { t } from '../utils/i18n.js';

export const resumeCommand: SlashCommand = {
  name: 'resume',
  get description() {
    return t('command.resume.description');
  },
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
