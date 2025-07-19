/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenDialogActionReturn, SlashCommandDefinition } from './types.js';

export const privacyCommand: SlashCommandDefinition = {
  name: 'privacy',
  description: 'display the privacy notice',
  action: (): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'privacy',
  }),
};
