/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, OpenDialogActionReturn, SlashCommand } from './types.js';

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'View and manage the generative model',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'set',
      description: 'Select the model to use for the current session',
      kind: CommandKind.BUILT_IN,
      action: (): OpenDialogActionReturn => ({
        type: 'dialog',
        dialog: 'model',
      }),
    },
  ],
};
