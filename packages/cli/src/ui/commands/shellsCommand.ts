/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { t } from '../utils/i18n.js';

export const shellsCommand: SlashCommand = {
  name: 'shells',
  altNames: ['bashes'],
  kind: CommandKind.BUILT_IN,
  get description() {
    return t('command.shells.description');
  },
  autoExecute: true,
  action: async (context) => {
    context.ui.toggleBackgroundShell();
  },
};
