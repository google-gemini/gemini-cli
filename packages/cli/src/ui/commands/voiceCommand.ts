/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';
import { SettingScope } from '../../config/settings.js';

export const voiceCommand: SlashCommand = {
  name: 'voice',
  description: 'Manage voice input settings',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const trimmedArgs = args?.trim() || '';
    const parts = trimmedArgs.split(/\s+/);
    const subCommand = parts[0]?.toLowerCase();

    // Handle set-path subcommand
    if (subCommand === 'set-path') {
      const path = parts[1];
      if (!path) {
        return {
          type: 'message',
          messageType: MessageType.ERROR,
          content: 'Usage: /voice set-path <path>',
        };
      }

      context.services.settings.setValue(
        SettingScope.User,
        'voice.whisperPath',
        path,
      );

      return {
        type: 'message',
        messageType: MessageType.INFO,
        content: `Voice Whisper path set to: ${path}`,
      };
    }

    // Show help if requested or if it's a help-like subcommand
    if (subCommand === 'help' || trimmedArgs.toLowerCase() === 'help') {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `🎤 Voice Input Help

Commands:
  /voice                  Toggle voice recording on/off
  /voice set-path <path>  Set the path to the whisper executable
  /voice help             Show this help message

Keyboard Shortcuts:
  Alt + R                 Start/stop voice recording
  Ctrl + Q                Alternative shortcut

Indicators:
  🎤                      Recording in progress
  ⏳                      Transcribing audio

Voice input uses your microphone to transcribe speech into text.
The transcribed text is automatically inserted at the cursor position.`,
        },
        Date.now(),
      );
      return;
    }

    // Default action: Toggle voice recording
    context.ui.toggleVoice();
    return;
  },
};
