/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import type { HistoryItemWithoutId } from '../types.js';
import path from 'node:path';
import {
  coreEvents,
  convertSessionToClientHistory,
  uiTelemetryService,
  loadConversationRecord,
  type Config,
  type ResumedSessionData,
} from '@google/gemini-cli-core';
import {
  convertSessionToHistoryFormats,
  type SessionInfo,
} from '../../utils/sessionUtils.js';
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
          const conversation = await loadConversationRecord(originalFilePath);
          if (!conversation) {
            throw new Error(
              `Failed to parse conversation from ${originalFilePath}`,
            );
          }

          // Use the old session's ID to continue it.
          const existingSessionId = conversation.sessionId;
          config.setSessionId(existingSessionId);
          uiTelemetryService.hydrate(conversation);

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
            convertSessionToClientHistory(conversation.messages),
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
      async (session: SessionInfo) => {
        // Note: Chat sessions are stored on disk using a filename derived from
        // the session, e.g. "session-<timestamp>-<sessionIdPrefix>.json".
        // The ChatRecordingService.deleteSession API expects this file basename
        // (without the ".json" extension), not the full session UUID.
        try {
          const chatRecordingService = config
            .getGeminiClient()
            ?.getChatRecordingService();
          if (chatRecordingService) {
            await chatRecordingService.deleteSession(session.file);
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
