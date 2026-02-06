/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';

export const voiceCommand: SlashCommand = {
  name: 'voice',
  description: 'Toggle voice input recording',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    // Show help if requested
    if (args?.trim().toLowerCase() === 'help') {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `🎤 Voice Input Help

Commands:
  /voice           Toggle voice recording on/off
  /voice help      Show this help message

Keyboard Shortcuts:
  Alt + R          Start/stop voice recording
  Ctrl + Q         Alternative shortcut

Indicators:
  🎤               Recording in progress
  ⏳               Transcribing audio

Voice input uses your microphone to transcribe speech into text.
The transcribed text is automatically inserted at the cursor position.`,
        },
        Date.now(),
      );
      return;
    }

    // Toggle voice recording
    context.ui.toggleVoice();
  },
};
