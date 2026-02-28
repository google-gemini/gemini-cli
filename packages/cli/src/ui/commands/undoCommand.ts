/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { rewindConversation } from './rewindCommand.js';
import { revertFileChanges } from '../utils/rewindFileOps.js';

/**
 * The /undo command removes the last conversation turn (the most recent user
 * prompt and the model response it triggered) from the context window.
 */
export const undoCommand: SlashCommand = {
  name: 'undo',
  description: 'Remove the last conversation turn from the context window',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not found',
      };
    }

    const client = config.getGeminiClient();
    if (!client) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Client not initialized',
      };
    }

    const recordingService = client.getChatRecordingService();
    if (!recordingService) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Recording service unavailable',
      };
    }

    const conversation = recordingService.getConversation();
    if (!conversation) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No conversation found.',
      };
    }

    // Find the last user message to rewind to (removing it and everything after)
    const lastUserMessage = [...conversation.messages]
      .reverse()
      .find((msg) => msg.type === 'user');

    if (!lastUserMessage) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Nothing to undo.',
      };
    }

    await revertFileChanges(conversation, lastUserMessage.id);
    await rewindConversation(
      context,
      client,
      recordingService,
      lastUserMessage.id,
      '',
    );

    return {
      type: 'message',
      messageType: 'info',
      content: 'Last conversation turn removed.',
    };
  },
};
