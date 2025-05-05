/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback } from 'react';
import { HistoryItem } from '../types.js';

export interface UseHistoryManagerReturn {
  history: HistoryItem[];
  addItemToHistory: (
    itemData: Omit<HistoryItem, 'id'>,
    baseTimestamp: number,
  ) => number; // Return the ID of the added item
  updateHistoryItem: (
    id: number,
    updates: Partial<Omit<HistoryItem, 'id'>>,
  ) => void;
  clearHistory: () => void;
}

/**
 * Custom hook to manage the chat history state.
 *
 * Encapsulates the history array, message ID generation, adding items,
 * updating items, and clearing the history.
 */
export function useHistoryManager(): UseHistoryManagerReturn {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const messageIdCounterRef = useRef(0);

  // Generates a unique message ID based on a timestamp and a counter.
  const getNextMessageId = useCallback((baseTimestamp: number): number => {
    // Increment *before* adding to ensure uniqueness against the base timestamp
    messageIdCounterRef.current += 1;
    return baseTimestamp + messageIdCounterRef.current;
  }, []);

  // Adds a new item to the history state with a unique ID and returns the ID.
  const addItemToHistory = useCallback(
    (itemData: Omit<HistoryItem, 'id'>, baseTimestamp: number): number => {
      const id = getNextMessageId(baseTimestamp);
      const newItem: HistoryItem = { ...itemData, id } as HistoryItem;
      setHistory((prevHistory) => [...prevHistory, newItem]);
      return id; // Return the generated ID
    },
    [getNextMessageId],
  );

  // Updates an existing history item identified by its ID.
  const updateHistoryItem = useCallback(
    (id: number, updates: Partial<Omit<HistoryItem, 'id'>>) => {
      setHistory((prevHistory) =>
        prevHistory.map((item) =>
          item.id === id ? ({ ...item, ...updates } as HistoryItem) : item,
        ),
      );
    },
    [],
  );

  // Clears the entire history state.
  const clearHistory = useCallback(() => {
    setHistory([]);
    messageIdCounterRef.current = 0; // Reset counter when history is cleared
  }, []);

  return { history, addItemToHistory, updateHistoryItem, clearHistory };
}
