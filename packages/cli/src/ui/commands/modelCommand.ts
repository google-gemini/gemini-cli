/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'Opens a dialog to configure the model',
  kind: CommandKind.BUILT_IN,
  action: async () => ({
    type: 'dialog',
    dialog: 'model',
  }),
};
