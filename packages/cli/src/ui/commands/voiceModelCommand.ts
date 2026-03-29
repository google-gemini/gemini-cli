/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

export const voiceModelCommand: SlashCommand = {
  name: 'voice-model',
  altNames: [],
  description: 'Manage voice transcription models',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async () => ({
      type: 'dialog',
      dialog: 'voice-model',
    }),
};
