/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import type { HistoryItemWithoutId } from '../types.js';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {
  coreEvents,
  convertSessionToClientHistory,
  uiTelemetryService,
  type Config,
  type ConversationRecord,
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
          let conversation: ConversationRecord;
          let filePath: string;

          if (session.fileName.endsWith('.ext')) {
            // External session
            let externalConv: ConversationRecord | null = null;
            if (config.getEnableExtensionReloading() !== false) {
              /* eslint-disable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any */
              const extensions = (config as any)._extensionLoader?.getExtensions
                ? (config as any)._extensionLoader.getExtensions()
                : [];
              for (const extension of extensions) {
                if (extension.trajectoryProviderModule) {
                  const prefix =
                    extension.trajectoryProviderModule.prefix || '';
                  if (session.id.startsWith(prefix)) {
                    const originalId = prefix
                      ? session.id.slice(prefix.length)
                      : session.id;
                    externalConv =
                      await extension.trajectoryProviderModule.loadSession(
                        originalId,
                      );
                    if (externalConv) break;
                  }
                }
              }
              /* eslint-enable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any */
            }

            if (!externalConv) {
              throw new Error(`Could not load external session ${session.id}`);
            }
            conversation = externalConv;
            filePath = session.id + '.ext';
          } else {
            // Regular CLI session
            const chatsDir = path.join(
              config.storage.getProjectTempDir(),
              'chats',
            );
            const fileName = session.fileName;
            filePath = path.join(chatsDir, fileName);

            // Load up the conversation.
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            conversation = JSON.parse(await fs.readFile(filePath, 'utf8'));
          }

          // Use the old session's ID to continue it.
          const existingSessionId = conversation.sessionId;
          config.setSessionId(existingSessionId);
          uiTelemetryService.hydrate(conversation);

          const resumedSessionData = {
            conversation,
            filePath,
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
