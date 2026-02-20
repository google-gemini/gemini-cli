/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import type { HistoryItemWithoutId } from '../types.js';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import type {
  Config,
  ConversationRecord,
  ResumedSessionData,
} from '@google/gemini-cli-core';
import { coreEvents } from '@google/gemini-cli-core';
import type { SessionInfo } from '../../utils/sessionUtils.js';
import { convertSessionToHistoryFormats } from '../../utils/sessionUtils.js';
import type { Part } from '@google/genai';

export { convertSessionToHistoryFormats };

export const useSessionBrowser = (
  config: Config,
  onLoadHistory: (
    uiHistory: HistoryItemWithoutId[],
    clientHistory: Array<{ role: 'user' | 'model'; parts: Part[] }>,
    resumedSessionData: ResumedSessionData,
  ) => Promise<void>,
) => {
  const [isSessionBrowserOpen, setIsSessionBrowserOpen] = useState(false);

  return {
    isSessionBrowserOpen,

    openSessionBrowser: useCallback(() => {
      setIsSessionBrowserOpen(true);
    }, []),

    closeSessionBrowser: useCallback(() => {
      setIsSessionBrowserOpen(false);
    }, []),

    /**
     * Loads a conversation by ID, and reinitializes the chat recording service with it.
     */
    handleResumeSession: useCallback(
      async (session: SessionInfo) => {
        try {
          const chatsDir = path.join(
            config.storage.getProjectTempDir(),
            'chats',
          );

          const fileName = session.fileName;

          const originalFilePath = path.join(chatsDir, fileName);

          // Load up the conversation.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const conversation: ConversationRecord = JSON.parse(
            await fs.readFile(originalFilePath, 'utf8'),
          );

          // Use the old session's ID to continue it.
          const existingSessionId = conversation.sessionId;
          config.setSessionId(existingSessionId);

          const resumedSessionData = {
            conversation,
            filePath: originalFilePath,
          };

          // We've loaded it; tell the UI about it.
          setIsSessionBrowserOpen(false);
          const historyData = convertSessionToHistoryFormats(
            conversation.messages,
          );
          await onLoadHistory(
            historyData.uiHistory,
            historyData.clientHistory,
            resumedSessionData,
          );
        } catch (error) {
          coreEvents.emitFeedback('error', 'Error resuming session:', error);
          setIsSessionBrowserOpen(false);
        }
      },
      [config, onLoadHistory],
    ),

    /**
     * Deletes a session by ID using the ChatRecordingService.
     */
    handleDeleteSession: useCallback(
      (session: SessionInfo) => {
        // Note: Chat sessions are stored on disk using a filename derived from
        // the session, e.g. "session-<timestamp>-<sessionIdPrefix>.json".
        // The ChatRecordingService.deleteSession API expects this file basename
        // (without the ".json" extension), not the full session UUID.
        try {
          const chatRecordingService = config
            .getGeminiClient()
            ?.getChatRecordingService();
          if (chatRecordingService) {
            chatRecordingService.deleteSession(session.file);
          }
        } catch (error) {
          coreEvents.emitFeedback('error', 'Error deleting session:', error);
          throw error;
        }
      },
      [config],
    ),
  };
};
