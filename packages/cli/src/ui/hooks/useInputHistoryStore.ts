/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';

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
  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * Initialize input history from logger with past session data.
   * Executed only once at app startup.
   */
  const initializeFromLogger = useCallback(
    async (logger: Logger | null) => {
      if (isInitialized || !logger) return;

      try {
        const pastMessages = (await logger.getPreviousUserMessages()) || [];
        // Logger returns newest first, reverse to get oldest first
        setInputHistory(pastMessages.reverse());
        setIsInitialized(true);
      } catch (error) {
        // Start with empty history even if logger initialization fails
        console.warn('Failed to initialize input history from logger:', error);
        setInputHistory([]);
        setIsInitialized(true);
      }
    },
    [isInitialized],
  );

  /**
   * Add new input to history.
   * Applies the same deduplication logic as the current implementation.
   */
  const addInput = useCallback((input: string) => {
    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    setInputHistory((prev) => {
      // Remove consecutive duplicate messages (same as current implementation)
      if (prev.length > 0 && prev[prev.length - 1] === trimmedInput) {
        return prev;
      }
      return [...prev, trimmedInput];
    });
  }, []);

  return {
    inputHistory,
    addInput,
    initializeFromLogger,
  };
}
