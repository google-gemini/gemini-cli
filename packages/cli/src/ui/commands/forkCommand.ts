/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

/**
 * /fork
 *
 * Saves a snapshot of the current conversation to a new session file.
 * Both the original and the forked session are independently resumable —
 * you can explore one direction while preserving the other.
 *
 * Inspired by Claude Code's /fork command.
 */

export const forkCommand: SlashCommand = {
  name: 'fork',
  description:
    'Save a fork of the current conversation to branch from this point',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const config = context.services.config;
    const client = config?.getGeminiClient();
    const recordingService = client?.getChatRecordingService();

    if (!config || !recordingService) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Could not access session state.',
      };
    }

    const shortId = recordingService.fork();

    if (!shortId) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Nothing to fork yet — start a conversation first.',
      };
    }

    return {
      type: 'message',
      messageType: 'info',
      content: `Fork saved (${shortId}).\nResume with: gemini --resume ${shortId}\nOr browse sessions with: /chat`,
    };
  },
};
