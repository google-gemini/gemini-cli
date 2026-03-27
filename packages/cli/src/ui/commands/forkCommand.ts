/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CommandKind, type SlashCommand } from './types.js';
import type { ConversationRecord } from '@google/gemini-cli-core';

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

    const conversation = recordingService.getConversation();
    if (!conversation || conversation.messages.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Nothing to fork yet — start a conversation first.',
      };
    }

    const forkSessionId = randomUUID();
    const shortId = forkSessionId.slice(0, 8);
    const timestamp = new Date().toISOString().slice(0, 16).replace(/:/g, '-');
    const filename = `session-${timestamp}-${shortId}.json`;

    const forked: ConversationRecord = {
      ...conversation,
      sessionId: forkSessionId,
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    const chatsDir = path.join(config.storage.getProjectTempDir(), 'chats');
    await fs.mkdir(chatsDir, { recursive: true });
    await fs.writeFile(
      path.join(chatsDir, filename),
      JSON.stringify(forked, null, 2),
      'utf-8',
    );

    return {
      type: 'message',
      messageType: 'info',
      content: `Fork saved (${shortId}).\nResume with: gemini --resume ${shortId}\nOr browse sessions with: /chat`,
    };
  },
};
