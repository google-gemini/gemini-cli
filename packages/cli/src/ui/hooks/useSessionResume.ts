/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  coreEvents,
  type Config,
  type ResumedSessionData,
  convertSessionToClientHistory,
} from '@google/gemini-cli-core';
import type { Part } from '@google/genai';
import type { HistoryItemWithoutId } from '../types.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { convertSessionToHistoryFormats } from './useSessionBrowser.js';
import { isSameProjectPath } from '../../utils/sessionUtils.js';

export type ResumeSource = 'startup' | 'browser';

export interface ResumeContextSwitchConfirmation {
  source: ResumeSource;
  sessionId: string;
  currentProjectPath: string;
  originProjectPath: string;
}

interface UseSessionResumeParams {
  config: Config;
  historyManager: UseHistoryManagerReturn;
  refreshStatic: () => void;
  isGeminiClientInitialized: boolean;
  setQuittingMessages: (messages: null) => void;
  resumedSessionData?: ResumedSessionData;
  isAuthenticating: boolean;
  canResumeOnStartup?: () => boolean;
  confirmResumeContextSwitch?: (
    details: ResumeContextSwitchConfirmation,
  ) => Promise<boolean>;
}

/**
 * Hook to handle session resumption logic.
 * Provides a callback to load history for resume and automatically
 * handles command-line resume on mount.
 */
export function useSessionResume({
  config,
  historyManager,
  refreshStatic,
  isGeminiClientInitialized,
  setQuittingMessages,
  resumedSessionData,
  isAuthenticating,
  canResumeOnStartup = () => true,
  confirmResumeContextSwitch,
}: UseSessionResumeParams) {
  const [isResuming, setIsResuming] = useState(false);

  // Use refs to avoid dependency chain that causes infinite loop
  const historyManagerRef = useRef(historyManager);
  const refreshStaticRef = useRef(refreshStatic);

  useEffect(() => {
    historyManagerRef.current = historyManager;
    refreshStaticRef.current = refreshStatic;
  });

  const loadHistoryForResume = useCallback(
    async (
      uiHistory: HistoryItemWithoutId[],
      clientHistory: Array<{ role: 'user' | 'model'; parts: Part[] }>,
      resumedData: ResumedSessionData,
      source: ResumeSource = 'browser',
    ): Promise<boolean> => {
      // Wait for the client.
      if (!isGeminiClientInitialized) {
        return false;
      }

      const originProjectPath =
        resumedData.originProjectPath ??
        resumedData.conversation.originProjectPath;
      const currentProjectPath = config.getProjectRoot();
      const requiresConfirmation =
        !!originProjectPath &&
        !isSameProjectPath(originProjectPath, currentProjectPath);

      if (requiresConfirmation && confirmResumeContextSwitch) {
        const confirmed = await confirmResumeContextSwitch({
          source,
          sessionId: resumedData.conversation.sessionId,
          currentProjectPath,
          originProjectPath,
        });
        if (!confirmed) {
          return false;
        }
      }

      setIsResuming(true);
      try {
        // Now that we have the client, load the history into the UI and the client.
        setQuittingMessages(null);
        historyManagerRef.current.clearItems();
        uiHistory.forEach((item, index) => {
          historyManagerRef.current.addItem(item, index, true);
        });
        refreshStaticRef.current(); // Force Static component to re-render with the updated history.

        // Restore directories from the resumed session
        if (
          resumedData.conversation.directories &&
          resumedData.conversation.directories.length > 0
        ) {
          const workspaceContext = config.getWorkspaceContext();
          // Add back any directories that were saved in the session
          // but filter out ones that no longer exist
          workspaceContext.addDirectories(resumedData.conversation.directories);
        }

        // Give the history to the Gemini client.
        await config.getGeminiClient()?.resumeChat(clientHistory, resumedData);
        return true;
      } catch (error) {
        coreEvents.emitFeedback(
          'error',
          'Failed to resume session. Please try again.',
          error,
        );
        return false;
      } finally {
        setIsResuming(false);
      }
    },
    [
      config,
      confirmResumeContextSwitch,
      isGeminiClientInitialized,
      setQuittingMessages,
    ],
  );

  // Handle interactive resume from the command line (-r/--resume without -p/--prompt-interactive).
  // Only if we're not authenticating and the client is initialized, though.
  const hasLoadedResumedSession = useRef(false);
  useEffect(() => {
    if (
      resumedSessionData &&
      !isAuthenticating &&
      canResumeOnStartup() &&
      isGeminiClientInitialized &&
      !hasLoadedResumedSession.current
    ) {
      hasLoadedResumedSession.current = true;
      const historyData = convertSessionToHistoryFormats(
        resumedSessionData.conversation.messages,
      );
      void loadHistoryForResume(
        historyData.uiHistory,
        convertSessionToClientHistory(resumedSessionData.conversation.messages),
        resumedSessionData,
        'startup',
      );
    }
  }, [
    resumedSessionData,
    isAuthenticating,
    canResumeOnStartup,
    isGeminiClientInitialized,
    loadHistoryForResume,
  ]);

  return { loadHistoryForResume, isResuming };
}
