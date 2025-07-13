/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type SlashCommand, type CommandContext } from './types.js';

export const pasteCommand: SlashCommand = {
  name: 'paste',
  description: 'Paste base64 image data. Use --clear to remove staged images.',
  action: async (context: CommandContext, args: string) => {
    console.log(`pasteCommand action called with args: "${args}"`);
    if (args.trim() === '--clear') {
      console.log('pasteCommand: --clear flag detected');
      context.ui.clearPastedContent();
      return {
        type: 'message',
        messageType: 'info',
        content: 'Staged images cleared.',
      };
    }

    console.log('pasteCommand: setting input mode to "paste"');
    context.ui.setInputMode('paste');
    console.log('pasteCommand: input mode set');
    return {
      type: 'message',
      messageType: 'info',
      content: 'Paste your data and press Enter. Press Esc to cancel.',
    };
  },
};
