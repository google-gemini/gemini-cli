/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SESSION_FILE_PREFIX,
  type ConversationRecord,
} from '@google/gemini-cli-core';
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
 * Represents a session file, which may be valid or corrupted.
 */
export interface SessionFileEntry {
  /** Full filename including .json extension */
  fileName: string;
  /** Parsed session info if valid, null if corrupted */
  sessionInfo: SessionInfo | null;
}

/**
 * Loads all session files (including corrupted ones) from the chats directory.
 * @returns Array of session file entries, with sessionInfo null for corrupted files
 */
export const getAllSessionFiles = async (
  chatsDir: string,
  currentSessionId?: string,
): Promise<SessionFileEntry[]> => {
  try {
    const files = await fs.readdir(chatsDir);
    const sessionFiles = files
      .filter((f) => f.startsWith(SESSION_FILE_PREFIX) && f.endsWith('.json'))
      .sort(); // Sort by filename, which includes timestamp

    const sessionPromises = sessionFiles.map(
      async (file): Promise<SessionFileEntry> => {
        const filePath = path.join(chatsDir, file);
        try {
          const content: ConversationRecord = JSON.parse(
            await fs.readFile(filePath, 'utf8'),
          );

          // Validate required fields
          if (
            !content.sessionId ||
            !content.messages ||
            !Array.isArray(content.messages) ||
            !content.startTime ||
            !content.lastUpdated
          ) {
            // Missing required fields - treat as corrupted
            return { fileName: file, sessionInfo: null };
          }

          const isCurrentSession = currentSessionId
            ? file.includes(currentSessionId.slice(0, 8))
            : false;

          const sessionInfo: SessionInfo = {
            id: content.sessionId,
            fileName: file,
            lastUpdated: content.lastUpdated,
            isCurrentSession,
          };

          return { fileName: file, sessionInfo };
        } catch {
          // File is corrupted (can't read or parse JSON)
          return { fileName: file, sessionInfo: null };
        }
      },
    );
    return await Promise.all(sessionPromises);
  } catch (error) {
    // It's expected that the directory might not exist, which is not an error.
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    // For other errors (e.g., permissions), re-throw to be handled by the caller.
    throw error;
  }
};

/**
 * Loads all valid session files from the chats directory and converts them to SessionInfo.
 * Corrupted files are automatically filtered out.
 */
export const getSessionFiles = async (
  chatsDir: string,
  currentSessionId?: string,
): Promise<SessionInfo[]> => {
  const allFiles = await getAllSessionFiles(chatsDir, currentSessionId);

  // Filter out corrupted files and extract SessionInfo
  const validSessions = allFiles
    .filter(
      (entry): entry is { fileName: string; sessionInfo: SessionInfo } =>
        entry.sessionInfo !== null,
    )
    .map((entry) => entry.sessionInfo);

  return validSessions;
};
