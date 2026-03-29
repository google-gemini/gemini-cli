/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

export const voiceCommand: SlashCommand = {
  name: 'voice',
  altNames: [],
  description: 'Toggle push-to-talk voice dictation mode',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context) => {
    context.ui.toggleVoiceMode();
  },
};
