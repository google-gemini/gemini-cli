/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';

export const renameCommand: SlashCommand = {
  name: 'rename',
  description: 'Set the display name for the current session',
  kind: CommandKind.BUILT_IN,
  action: async (context, input): Promise<SlashCommandActionReturn | void> => {
    const newName = input.trim();
    if (!newName) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Please provide a new name for the session.',
      };
    }

    if (!context.services.chatRecordingService) {
      return;
    }

    context.services.chatRecordingService.setDisplayName(newName);

    return {
      type: 'message',
      messageType: 'info',
      content: `Session renamed to "${newName}"`,
    };
  },
};
