/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

export const forkCommand: SlashCommand = {
  name: 'fork',
  description:
    'Save a copy of the current session under a new id so it can be resumed independently in another terminal.',
  kind: CommandKind.BUILT_IN,
  action: (context) => {
    const client = context.services.agentContext?.geminiClient;
    if (!client) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Client not initialized.',
      };
    }

    const recording = client.getChatRecordingService();
    if (!recording || !recording.getConversation()) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No conversation to fork.',
      };
    }

    try {
      const { shortId } = recording.fork();
      return {
        type: 'message',
        messageType: 'info',
        content:
          `Fork saved (${shortId}).\n` +
          `Resume in another terminal: gemini --resume ${shortId}`,
      };
    } catch (err) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to fork session: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  },
};
