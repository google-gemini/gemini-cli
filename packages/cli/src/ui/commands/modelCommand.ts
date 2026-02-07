/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { t } from '../utils/i18n.js';

export const modelCommand: SlashCommand = {
  name: 'model',
  get description() {
    return t('command.model.description');
  },
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    if (context.services.config) {
      await context.services.config.refreshUserQuota();
    }
    return {
      type: 'dialog',
      dialog: 'model',
    };
  },
};
