/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { rewindConversation } from './rewindCommand.js';
import { partToString } from '@google/gemini-cli-core';

export const undoCommand: SlashCommand = {
  name: 'undo',
  description: 'Revert the last conversation turn',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    const client = context.services.config?.getGeminiClient();
    const recordingService = client?.getChatRecordingService();
    const conversation = recordingService?.getConversation();

    if (!client || !recordingService || !conversation) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Undo unavailable.',
      };
    }

    const messages = conversation.messages;
    const lastUserIndex = messages.findLastIndex((m) => m.type === 'user');

    // User message and a model response to undo turn
    if (messages.length < 2) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Nothing to undo.',
      };
    }

    const targetId = messages[lastUserIndex].id;
    const lastUserPrompt = messages[lastUserIndex].content;

    await rewindConversation(
      context,
      client,
      recordingService,
      targetId,
      partToString(lastUserPrompt),
    );

    return {
      type: 'message',
      messageType: 'info',
      content: 'Undid last turn.',
    };
  },
};
