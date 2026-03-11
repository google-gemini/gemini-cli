/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type OpenDialogActionReturn,
  type SlashCommand,
} from './types.js';

export const privacyCommand: SlashCommand = {
  name: 'privacy',
  description: 'Display the privacy notice',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'privacy',
  }),
};
