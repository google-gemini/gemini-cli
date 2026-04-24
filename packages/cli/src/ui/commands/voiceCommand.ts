/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

export const voiceCommand: SlashCommand = {
  name: 'voice',
  altNames: [],
  description: 'Toggle voice dictation mode',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context) => {
    context.ui.toggleVoiceMode();
  },
  subCommands: [
    {
      name: 'model',
      description: 'Manage voice transcription models',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async () => ({
        type: 'dialog',
        dialog: 'voice-model',
      }),
    },
  ],
};
