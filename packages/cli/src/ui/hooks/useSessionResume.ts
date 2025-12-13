/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef } from 'react';
import type { Config, ResumedSessionData } from '@google/gemini-cli-core';
import type { Part } from '@google/genai';
import type { HistoryItemWithoutId } from '../types.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { convertSessionToHistoryFormats } from './useSessionBrowser.js';

interface UseSessionResumeParams {
  config: Config;
  historyManager: UseHistoryManagerReturn;
  refreshStatic: () => void;
  isGeminiClientInitialized: boolean;
  setQuittingMessages: (messages: null) => void;
  resumedSessionData?: ResumedSessionData;
  isAuthenticating: boolean;
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
}: UseSessionResumeParams) {
  // Use refs to avoid dependency chain that causes infinite loop
  const historyManagerRef = useRef(historyManager);
  const refreshStaticRef = useRef(refreshStatic);

  useEffect(() => {
    historyManagerRef.current = historyManager;
    refreshStaticRef.current = refreshStatic;
  });

  const loadHistoryForResume = useCallback(
    (
      uiHistory: HistoryItemWithoutId[],
      clientHistory: Array<{ role: 'user' | 'model'; parts: Part[] }>,
      resumedData: ResumedSessionData,
    ) => {
      // Wait for the client.
      if (!isGeminiClientInitialized) {
        return;
      }

      // Now that we have the client, load the history into the UI and the client.
      setQuittingMessages(null);
      historyManagerRef.current.clearItems();
      uiHistory.forEach((item, index) => {
        historyManagerRef.current.addItem(item, index, true);
      });
      refreshStaticRef.current(); // Force Static component to re-render with the updated history.

      // Give the history to the Gemini client.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      config.getGeminiClient()?.resumeChat(clientHistory, resumedData);
    },
    [config, isGeminiClientInitialized, setQuittingMessages],
  );

  // Handle interactive resume from the command line (-r/--resume without -p/--prompt-interactive).
  // Only if we're not authenticating and the client is initialized, though.
  const hasLoadedResumedSession = useRef(false);
  useEffect(() => {
    if (
      resumedSessionData &&
      !isAuthenticating &&
      isGeminiClientInitialized &&
      !hasLoadedResumedSession.current
    ) {
      hasLoadedResumedSession.current = true;
      const historyData = convertSessionToHistoryFormats(
        resumedSessionData.conversation.messages,
      );
      loadHistoryForResume(
        historyData.uiHistory,
        historyData.clientHistory,
        resumedSessionData,
      );
    }
  }, [
    resumedSessionData,
    isAuthenticating,
    isGeminiClientInitialized,
    loadHistoryForResume,
  ]);

  return { loadHistoryForResume };
}
