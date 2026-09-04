/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';
import { useState, useCallback, useRef } from 'react';

interface Logger {
  getPreviousUserMessages(): Promise<string[]>;
}

export interface UseInputHistoryStoreReturn {
  inputHistory: string[];
  addInput: (input: string) => void;
  initializeFromLogger: (logger: Logger | null) => Promise<void>;
}

/**
 * Hook for independently managing input history.
 * Completely separated from chat history and unaffected by /clear commands.
 */
export function useInputHistoryStore(): UseInputHistoryStoreReturn {
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [_pastSessionMessages, setPastSessionMessages] = useState<string[]>([]);
  const [_currentSessionMessages, setCurrentSessionMessages] = useState<
    string[]
  >([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Mirrors of the two message lists, read by addInput so it can derive the
  // next history without reading state from inside an updater. State updaters
  // must be pure and may run more than once (StrictMode double-invoke, replays
  // under batching), so they cannot be used to sequence dependent updates.
  const pastRef = useRef<string[]>([]);
  const currentRef = useRef<string[]>([]);

  /**
   * Recalculate the complete input history from past and current sessions.
   * Applies the same deduplication logic as the previous implementation.
   */
  const recalculateHistory = useCallback(
    (currentSession: string[], pastSession: string[]) => {
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
      setInputHistory(deduplicatedMessages.reverse());
    },
    [],
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
        pastRef.current = pastMessages;
        setPastSessionMessages(pastMessages); // Store as newest first
        recalculateHistory([], pastMessages);
        setIsInitialized(true);
      } catch (error) {
        // Start with empty history even if logger initialization fails
        debugLogger.warn(
          'Failed to initialize input history from logger:',
          error,
        );
        pastRef.current = [];
        setPastSessionMessages([]);
        recalculateHistory([], []);
        setIsInitialized(true);
      }
    },
    [isInitialized, recalculateHistory],
  );

  /**
   * Add new input to history.
   * Recalculates the entire history with deduplication.
   */
  const addInput = useCallback(
    (input: string) => {
      const trimmedInput = input.trim();
      if (!trimmedInput) return; // Filter empty/whitespace-only inputs

      // Derive everything up front, then issue plain state updates. Keeping the
      // derivation out of the updaters means a replayed or double-invoked
      // updater cannot run recalculateHistory (itself a setState) again.
      const newCurrentSession = [...currentRef.current, trimmedInput];
      currentRef.current = newCurrentSession;

      setCurrentSessionMessages(newCurrentSession);
      recalculateHistory(
        newCurrentSession.slice().reverse(), // Convert to newest first
        pastRef.current,
      );
    },
    [recalculateHistory],
  );

  return {
    inputHistory,
    addInput,
    initializeFromLogger,
  };
}
