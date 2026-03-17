/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { SESSION_FILE_PREFIX } from '@google/gemini-cli-core';
import { CommandKind, type SlashCommand } from './types.js';
import type {
  MessageActionReturn,
  ConversationRecord,
} from '@google/gemini-cli-core';

/**
 * Fork command: Creates an independent copy of the current conversation session.
 * This allows users to explore different directions from the same conversation point
 * without write conflicts that occur when using --resume in multiple terminals.
 */
export const forkCommand: SlashCommand = {
  name: 'fork',
  description: 'Create a fork of the current conversation session',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, _args): Promise<MessageActionReturn> => {
    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Cannot fork: No active session.',
      };
    }

    try {
      // Get the current session ID and temp directory
      const currentSessionId = config.getSessionId();
      const projectTempDir = config.storage.getProjectTempDir();
      const chatsDir = path.join(projectTempDir, 'chats');

      // Find the current session file by searching for files ending with the short session ID
      const shortSessionId = currentSessionId.slice(0, 8);
      const files = await fs.readdir(chatsDir);
      const currentSessionFiles = files.filter(
        (f) => f.startsWith(SESSION_FILE_PREFIX) && f.includes(shortSessionId),
      );

      if (currentSessionFiles.length === 0) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Cannot fork: No active session file found.',
        };
      }

      // If multiple files match, use the most recently modified
      const sessionFilesWithStats = await Promise.all(
        currentSessionFiles.map(async (fileName) => {
          const filePath = path.join(chatsDir, fileName);
          const stats = await fs.stat(filePath);
          return { fileName, filePath, mtime: stats.mtimeMs };
        }),
      );

      sessionFilesWithStats.sort((a, b) => b.mtime - a.mtime);
      const currentSessionFile = sessionFilesWithStats[0].filePath;

      // Read the current conversation
      const fileContent = await fs.readFile(currentSessionFile, 'utf8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const conversation: ConversationRecord = JSON.parse(fileContent);

      // Create a new session with a unique ID
      const newSessionId = randomUUID();
      const newShortId = newSessionId.slice(0, 8);
      const timestamp = new Date()
        .toISOString()
        .slice(0, 16)
        .replace(/:/g, '-');
      const newFileName = `${SESSION_FILE_PREFIX}${timestamp}-${newShortId}.json`;
      const newFilePath = path.join(chatsDir, newFileName);

      // Create the forked conversation with updated metadata
      const forkedConversation: ConversationRecord = {
        ...conversation,
        sessionId: newSessionId,
        lastUpdated: new Date().toISOString(),
      };

      // Write the forked conversation to the new file
      await fs.writeFile(
        newFilePath,
        JSON.stringify(forkedConversation, null, 2),
        'utf8',
      );

      // Return success message with resume instructions
      return {
        type: 'message',
        messageType: 'info',
        content: `Fork saved (${newShortId}).\nResume with: gemini --resume ${newShortId}\nOr browse sessions with: /chat`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to fork session: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};
