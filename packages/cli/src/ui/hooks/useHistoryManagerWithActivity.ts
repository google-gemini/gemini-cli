/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback } from 'react';
import type { HistoryItem } from '../types.js';
import type { Config } from '@google/gemini-cli-core';
import { useActivityRecorder } from './useActivityMonitoring.js';

// Type for the updater function passed to updateHistoryItem
type HistoryItemUpdater = (
  prevItem: HistoryItem,
) => Partial<Omit<HistoryItem, 'id'>>;

export interface UseHistoryManagerWithActivityReturn {
  history: HistoryItem[];
  addItem: (itemData: Omit<HistoryItem, 'id'>, baseTimestamp: number) => number; // Returns the generated ID
  updateItem: (
    id: number,
    updates: Partial<Omit<HistoryItem, 'id'>> | HistoryItemUpdater,
  ) => void;
  clearItems: () => void;
  loadHistory: (newHistory: HistoryItem[]) => void;
}

/**
 * Enhanced version of useHistory that integrates activity monitoring
 *
 * Automatically records activity events when history items are added or updated.
 */
export function useHistoryWithActivity(
  config: Config,
  enableActivityMonitoring = true,
): UseHistoryManagerWithActivityReturn {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const messageIdCounterRef = useRef(0);

  // Activity recording hooks
  const { recordMessageAdded, recordHistoryUpdate } = useActivityRecorder(
    config,
    enableActivityMonitoring,
  );

  // Generates a unique message ID based on a timestamp and a counter.
  const getNextMessageId = useCallback((baseTimestamp: number): number => {
    messageIdCounterRef.current += 1;
    return baseTimestamp + messageIdCounterRef.current;
  }, []);

  const loadHistory = useCallback(
    (newHistory: HistoryItem[]) => {
      setHistory(newHistory);

      // Record activity for history loading
      if (enableActivityMonitoring) {
        recordHistoryUpdate();
      }
    },
    [enableActivityMonitoring, recordHistoryUpdate],
  );

  // Adds a new item to the history state with a unique ID.
  const addItem = useCallback(
    (itemData: Omit<HistoryItem, 'id'>, baseTimestamp: number): number => {
      const id = getNextMessageId(baseTimestamp);
      const newItem: HistoryItem = { ...itemData, id } as HistoryItem;

      let wasAdded = false;
      setHistory((prevHistory) => {
        if (prevHistory.length > 0) {
          const lastItem = prevHistory[prevHistory.length - 1];
          // Prevent adding duplicate consecutive user messages
          if (
            lastItem.type === 'user' &&
            newItem.type === 'user' &&
            lastItem.text === newItem.text
          ) {
            return prevHistory; // Don't add the duplicate
          }
        }
        wasAdded = true;
        return [...prevHistory, newItem];
      });

      // Record activity for message addition
      if (wasAdded && enableActivityMonitoring) {
        recordMessageAdded();
      }

      return id; // Return the generated ID (even if not added, to keep signature)
    },
    [getNextMessageId, enableActivityMonitoring, recordMessageAdded],
  );

  /**
   * Updates an existing history item identified by its ID.
   * @deprecated Prefer not to update history item directly as we are currently
   * rendering all history items in <Static /> for performance reasons. Only use
   * if ABSOLUTELY NECESSARY
   */
  const updateItem = useCallback(
    (
      id: number,
      updates: Partial<Omit<HistoryItem, 'id'>> | HistoryItemUpdater,
    ) => {
      let wasUpdated = false;
      setHistory((prevHistory) =>
        prevHistory.map((item) => {
          if (item.id === id) {
            // Apply updates based on whether it's an object or a function
            const newUpdates =
              typeof updates === 'function' ? updates(item) : updates;
            wasUpdated = true;
            return { ...item, ...newUpdates } as HistoryItem;
          }
          return item;
        }),
      );

      // Record activity for history item update
      if (wasUpdated && enableActivityMonitoring) {
        recordHistoryUpdate();
      }
    },
    [enableActivityMonitoring, recordHistoryUpdate],
  );

  // Clears the entire history state and resets the ID counter.
  const clearItems = useCallback(() => {
    const previousCount = history.length;
    setHistory([]);
    messageIdCounterRef.current = 0;

    // Record activity for history clearing
    if (enableActivityMonitoring && previousCount > 0) {
      recordHistoryUpdate();
    }
  }, [history.length, enableActivityMonitoring, recordHistoryUpdate]);

  return {
    history,
    addItem,
    updateItem,
    clearItems,
    loadHistory,
  };
}
