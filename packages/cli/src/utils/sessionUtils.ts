/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  ConversationRecord,
  MessageRecord,
} from '@google/gemini-cli-core';
import * as fs from 'fs/promises';
import path from 'path';

/**
 * Session information for display and selection purposes.
 */
export interface SessionInfo {
  /** Unique session identifier (filename without .json) */
  id: string;
  /** Filename without extension */
  file: string;
  /** Full filename including .json extension */
  fileName: string;
  /** ISO timestamp when session started */
  startTime: string;
  /** Total number of messages in the session */
  messageCount: number;
  /** ISO timestamp when session was last updated */
  lastUpdated: string;
  /** Display name for the session (typically first user message) */
  displayName: string;
  /** Cleaned first user message content */
  firstUserMessage: string;
  /** Whether this is the currently active session */
  isCurrentSession: boolean;
  /** Display index in the list */
  index: number;
}

/**
 * Result of resolving a session selection argument.
 */
export interface SessionSelectionResult {
  sessionPath: string;
  sessionData: ConversationRecord;
  displayInfo: string;
}

/**
 * Extracts the first meaningful user message from conversation messages.
 */
export const extractFirstUserMessage = (messages: MessageRecord[]): string => {
  const userMessage = messages.find(
    (msg) =>
      msg.type === 'user' && msg.content?.trim() && msg.content !== '/resume',
  );

  if (!userMessage) {
    return 'Empty conversation';
  }

  // Truncate long messages for display
  const content = userMessage.content.trim();
  return content.length > 100 ? content.slice(0, 97) + '...' : content;
};

/**
 * Extracts session ID from filename.
 * Session files are named: session-YYYY-MM-DDTHH-MM-SS-<sessionId-8-chars>.json
 */
export const extractSessionId = (fileName: string): string => {
  // Extract the last part after the final dash, before .json
  const match = fileName.match(/session-.*-([a-f0-9]{8})\.json$/);
  return match ? match[1] : fileName.replace('.json', '');
};

/**
 * Formats a timestamp as relative time (e.g., "2 hours ago", "3 days ago").
 */
export const formatRelativeTime = (timestamp: string): string => {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now.getTime() - time.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  } else {
    return 'Just now';
  }
};

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
      .sort(); // Sort by filename (includes timestamp)

    const sessionPromises = sessionFiles.map(async (file) => {
      const filePath = path.join(chatsDir, file);
      try {
        const content: ConversationRecord = JSON.parse(
          await fs.readFile(filePath, 'utf8'),
        );

        const firstUserMessage = extractFirstUserMessage(content.messages);
        const sessionId = extractSessionId(file);
        const isCurrentSession = currentSessionId
          ? file.includes(currentSessionId.slice(0, 8))
          : false;

        return {
          id: sessionId,
          file: file.replace('.json', ''),
          fileName: file,
          startTime: content.startTime,
          lastUpdated: content.lastUpdated,
          messageCount: content.messages.length,
          displayName: firstUserMessage,
          firstUserMessage,
          isCurrentSession,
          index: 0, // Will be set after sorting
        } as SessionInfo;
      } catch {
        return null; // Skip corrupted files
      }
    });

    const results = await Promise.all(sessionPromises);
    const filteredResults = results.filter(
      (session): session is SessionInfo => session !== null,
    );

    // Sort by startTime (oldest first) for stable session numbering
    filteredResults.sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    // Set the correct 1-based indexes after sorting
    filteredResults.forEach((session, index) => {
      session.index = index + 1;
    });

    return filteredResults;
  } catch {
    return []; // Return empty array if directory doesn't exist or can't be read
  }
};

/**
 * Utility class for session discovery and selection.
 */
export class SessionSelector {
  constructor(private config: Config) {}

  /**
   * Lists all available sessions for the current project.
   */
  async listSessions(): Promise<SessionInfo[]> {
    const chatsDir = path.join(this.config.getProjectTempDir(), 'chats');
    return getSessionFiles(chatsDir, this.config.getSessionId());
  }

  /**
   * Resolves a resume argument to a specific session.
   *
   * @param resumeArg - Can be "latest", a session ID prefix, or an index number (1-based)
   * @returns Promise resolving to session selection result
   */
  async resolveSession(resumeArg: string): Promise<SessionSelectionResult> {
    const sessions = await this.listSessions();

    if (sessions.length === 0) {
      throw new Error('No previous sessions found for this project.');
    }

    // Sort by startTime (oldest first, so newest sessions get highest numbers)
    sessions.sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    let selectedSession: SessionInfo;

    if (resumeArg === 'latest') {
      selectedSession = sessions[sessions.length - 1];
    } else {
      // Parse as index number (1-based) - only allow numeric indexes
      const index = parseInt(resumeArg, 10);
      if (
        !isNaN(index) &&
        index.toString() === resumeArg &&
        index > 0 &&
        index <= sessions.length
      ) {
        selectedSession = sessions[index - 1];
      } else {
        throw new Error(
          `Invalid session index "${resumeArg}". Use --list-sessions to see available sessions, then use --resume {number} or --resume latest.`,
        );
      }
    }

    return this.selectSession(selectedSession);
  }

  /**
   * Loads session data for a selected session.
   */
  private async selectSession(
    sessionInfo: SessionInfo,
  ): Promise<SessionSelectionResult> {
    const chatsDir = path.join(this.config.getProjectTempDir(), 'chats');
    const sessionPath = path.join(chatsDir, sessionInfo.fileName);

    try {
      const sessionData: ConversationRecord = JSON.parse(
        await fs.readFile(sessionPath, 'utf8'),
      );

      const displayInfo = `Session ${sessionInfo.index}: ${sessionInfo.firstUserMessage} (${sessionInfo.messageCount} messages, ${formatRelativeTime(sessionInfo.lastUpdated)})`;

      return {
        sessionPath,
        sessionData,
        displayInfo,
      };
    } catch (error) {
      throw new Error(
        `Failed to load session ${sessionInfo.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
