/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

export const voiceCommand: SlashCommand = {
  name: 'voice',
  description: 'Toggle voice input recording',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    // We can't access toggleVoice from here yet, but we will soon
    context.ui.toggleVoice();
  },
};
