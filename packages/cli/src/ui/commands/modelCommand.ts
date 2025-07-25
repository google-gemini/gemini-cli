/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenDialogActionReturn, SlashCommand, CommandKind } from './types.js';

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'Select a model to use',
  kind: CommandKind.BUILT_IN,
  action: (): OpenDialogActionReturn => {
    return {
      type: 'dialog',
      dialog: 'model',
    };
  },
};
