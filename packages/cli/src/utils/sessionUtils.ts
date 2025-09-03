/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversationRecord } from '@google/gemini-cli-core';
import * as fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Session information for display and selection purposes.
 */
export interface SessionInfo {
  /** Unique session identifier (filename without .json) */
  id: string;
  /** Full filename including .json extension */
  fileName: string;
  /** ISO timestamp when session was last updated */
  lastUpdated: string;
  /** Whether this is the currently active session */
  isCurrentSession: boolean;
}

/**
 * Loads all session files from the chats directory and converts them to SessionInfo.
 */
export const getSessionFiles = async (
  chatsDir: string,
  currentSessionId?: string,
): Promise<SessionInfo[]> => {
  try {
    const files = await fs.readdir(chatsDir);
    const sessionFiles = files
      .filter((f) => f.startsWith('session-') && f.endsWith('.json'))
      .sort(); // Sort by filename, which includes timestamp

    const sessionPromises = sessionFiles.map(async (file) => {
      const filePath = path.join(chatsDir, file);
      try {
        const content: ConversationRecord = JSON.parse(
          await fs.readFile(filePath, 'utf8'),
        );

        const isCurrentSession = currentSessionId
          ? file.includes(currentSessionId.slice(0, 8))
          : false;

        return {
          id: content.sessionId, // Use full UUID instead of extracted 8-char version
          fileName: file,
          lastUpdated: content.lastUpdated,
          isCurrentSession,
        } as SessionInfo;
      } catch {
        return null; // Skip corrupted files
      }
    });

    const results = await Promise.all(sessionPromises);
    const filteredResults = results.filter(
      (session): session is SessionInfo => session !== null,
    );

    return filteredResults;
  } catch {
    return []; // Return empty array if directory doesn't exist or can't be read
  }
};
