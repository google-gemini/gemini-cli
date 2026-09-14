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
  // Refs, not state: nothing renders these, they are only ever read to
  // recompute `inputHistory`. As state the only way to read the latest value
  // was from inside a `setState` updater, and an updater that calls another
  // one is a side effect in a function React requires to be pure.
  const pastSessionMessages = useRef<string[]>([]);
  const currentSessionMessages = useRef<string[]>([]);
  // A ref as well, because this guard has to hold on the second of two calls
  // that arrive before any state update has been applied.
  const isInitialized = useRef(false);

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
      if (isInitialized.current || !logger) return;
      isInitialized.current = true;

      try {
        const pastMessages = (await logger.getPreviousUserMessages()) || [];
        pastSessionMessages.current = pastMessages; // Store as newest first
        recalculateHistory(currentSessionMessages.current, pastMessages);
      } catch (error) {
        // Start with empty history even if logger initialization fails
        debugLogger.warn(
          'Failed to initialize input history from logger:',
          error,
        );
        pastSessionMessages.current = [];
        recalculateHistory(currentSessionMessages.current, []);
      }
    },
    [recalculateHistory],
  );

  /**
   * Add new input to history.
   * Recalculates the entire history with deduplication.
   */
  const addInput = useCallback(
    (input: string) => {
      const trimmedInput = input.trim();
      if (!trimmedInput) return; // Filter empty/whitespace-only inputs

      currentSessionMessages.current = [
        ...currentSessionMessages.current,
        trimmedInput,
      ];

      recalculateHistory(
        currentSessionMessages.current.slice().reverse(), // Convert to newest first
        pastSessionMessages.current,
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
