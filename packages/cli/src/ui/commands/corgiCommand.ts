/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { t } from '../utils/i18n.js';

export const corgiCommand: SlashCommand = {
  name: 'corgi',
  get description() {
    return t('command.corgi.description', { default: 'Toggles corgi mode' });
  },
  hidden: true,
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context, _args) => {
    context.ui.toggleCorgiMode();
  },
};
