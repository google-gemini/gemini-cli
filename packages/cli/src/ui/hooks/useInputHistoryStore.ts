/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';
import { useState, useCallback, useMemo } from 'react';

interface Logger {
  getPreviousUserMessages(): Promise<string[]>;
}

export interface UseInputHistoryStoreReturn {
  inputHistory: string[];
  addInput: (input: string) => void;
  initializeFromLogger: (logger: Logger | null) => Promise<void>;
}

/**
 * Combine the current session (newest first) with the past session (newest
 * first) into a single deduplicated history, returned oldest first.
 */
export function computeInputHistory(
  currentSession: string[],
  pastSession: string[],
): string[] {
  // Combine current session (newest first) + past session (newest first)
  const combinedMessages = [...currentSession, ...pastSession];

  // Deduplicate consecutive identical messages (same algorithm as before)
  const deduplicatedMessages: string[] = [];
  if (combinedMessages.length > 0) {
    deduplicatedMessages.push(combinedMessages[0]); // Add the newest one unconditionally
    for (let i = 1; i < combinedMessages.length; i++) {
      if (combinedMessages[i] !== combinedMessages[i - 1]) {
        deduplicatedMessages.push(combinedMessages[i]);
      }
    }
  }

  // Reverse to oldest first for useInputHistory
  return deduplicatedMessages.reverse();
}

/**
 * Hook for independently managing input history.
 * Completely separated from chat history and unaffected by /clear commands.
 */
export function useInputHistoryStore(): UseInputHistoryStoreReturn {
  const [pastSessionMessages, setPastSessionMessages] = useState<string[]>([]);
  const [currentSessionMessages, setCurrentSessionMessages] = useState<
    string[]
  >([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Derived during render, so there is no extra render pass and no window
  // where consumers see a stale history next to fresh session state.
  const inputHistory = useMemo(
    () =>
      computeInputHistory(
        currentSessionMessages.slice().reverse(), // Convert to newest first
        pastSessionMessages,
      ),
    [currentSessionMessages, pastSessionMessages],
  );

  /**
   * Initialize input history from logger with past session data.
   * Executed only once at app startup.
   */
  const initializeFromLogger = useCallback(
    async (logger: Logger | null) => {
      if (isInitialized || !logger) return;

      try {
        const pastMessages = (await logger.getPreviousUserMessages()) || [];
        setPastSessionMessages(pastMessages); // Store as newest first
        setIsInitialized(true);
      } catch (error) {
        // Start with empty history even if logger initialization fails
        debugLogger.warn(
          'Failed to initialize input history from logger:',
          error,
        );
        setPastSessionMessages([]);
        setIsInitialized(true);
      }
    },
    [isInitialized],
  );

  /**
   * Add new input to history.
   * Recalculates the entire history with deduplication.
   */
  const addInput = useCallback((input: string) => {
    const trimmedInput = input.trim();
    if (!trimmedInput) return; // Filter empty/whitespace-only inputs

    setCurrentSessionMessages((prevCurrent) => [...prevCurrent, trimmedInput]);
  }, []);

  return {
    inputHistory,
    addInput,
    initializeFromLogger,
  };
}
