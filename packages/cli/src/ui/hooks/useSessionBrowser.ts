/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import type { HistoryItemWithoutId } from '../types.js';
import * as fs from 'node:fs/promises';
import type {
  Config,
  ResumedSessionData,
} from '@google/gemini-cli-core';
import { coreEvents } from '@google/gemini-cli-core';
import type { SessionInfo } from '../../utils/sessionUtils.js';
import {
  convertSessionToHistoryFormats,
  deleteSessionArtifacts,
  renameSession,
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
          // Load up the conversation.
          const conversation = JSON.parse(
            await fs.readFile(session.sessionPath, 'utf8'),
          );

          // Use the old session's ID to continue it.
          const existingSessionId = conversation.sessionId;
          config.setSessionId(existingSessionId);

          const resumedSessionData = {
            conversation,
            filePath: session.sessionPath,
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
     * Deletes a session and related tool output artifacts.
     */
    handleDeleteSession: useCallback(
      async (session: SessionInfo): Promise<void> => {
        try {
          await deleteSessionArtifacts(session);
        } catch (error) {
          coreEvents.emitFeedback('error', 'Error deleting session:', error);
          throw error;
        }
      },
      [],
    ),

    handleRenameSession: useCallback(
      async (session: SessionInfo, newNameBase: string): Promise<SessionInfo> => {
        try {
          const result = await renameSession(session, newNameBase);
          return result.sessionInfo;
        } catch (error) {
          coreEvents.emitFeedback('error', 'Error renaming session:', error);
          throw error;
        }
      },
      [],
    ),
  };
};
