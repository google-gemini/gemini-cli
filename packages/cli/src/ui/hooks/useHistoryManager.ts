/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import type { HistoryItem } from '../types.js';
import type { ChatRecordingService } from '@google/gemini-cli-core/src/services/chatRecordingService.js';

// Type for the updater function passed to updateHistoryItem
type HistoryItemUpdater = (
  prevItem: HistoryItem,
) => Partial<Omit<HistoryItem, 'id'>>;

export interface UseHistoryManagerReturn {
  history: HistoryItem[];
  addItem: (
    itemData: Omit<HistoryItem, 'id'>,
    baseTimestamp?: number,
    isResuming?: boolean,
  ) => number; // Returns the generated ID
  updateItem: (
    id: number,
    updates: Partial<Omit<HistoryItem, 'id'>> | HistoryItemUpdater,
  ) => void;
  clearItems: () => void;
  loadHistory: (newHistory: HistoryItem[]) => void;
}

/**
 * Custom hook to manage the chat history state.
 *
 * Encapsulates the history array, message ID generation, adding items,
 * updating items, and clearing the history.
 */
export function useHistory({
  chatRecordingService,
}: {
  chatRecordingService?: ChatRecordingService | null;
} = {}): UseHistoryManagerReturn {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const messageIdCounterRef = useRef(0);

  const getNextMessageId = useCallback((baseTimestamp: number) => {
    // Generate a unique ID using timestamp and a counter to handle
    // multiple messages in the same millisecond
    messageIdCounterRef.current += 1;
    return baseTimestamp + messageIdCounterRef.current;
  }, []);

  const loadHistory = useCallback((newHistory: HistoryItem[]) => {
    setHistory(newHistory);
  }, []);

  /**
   * Adds an item to the history.
   * Returns the ID of the added item.
   */
  const addItem = useCallback(
    (
      itemData: Omit<HistoryItem, 'id'>,
      baseTimestamp: number = Date.now(),
      isResuming: boolean = false,
    ): number => {
      const id = getNextMessageId(baseTimestamp);
      const newItem: HistoryItem = { ...itemData, id } as HistoryItem;

      setHistory((prev) => {
        if (prev.length > 0) {
          const lastItem = prev[prev.length - 1];
          // Prevent adding duplicate consecutive user messages
          if (
            lastItem.type === 'user' &&
            newItem.type === 'user' &&
            lastItem.text === newItem.text
          ) {
            return prev; // Don't add the duplicate
          }
        }
        return [...prev, newItem];
      });

      // Record UI-specific messages, but don't do it if we're actually loading
      // an existing session.
      if (!isResuming && chatRecordingService) {
        // Safe access to text property
        const content = 'text' in itemData ? (itemData.text as string) : '';

        switch (itemData.type) {
          case 'compression':
          case 'verbose':
          case 'info':
            chatRecordingService?.recordMessage({
              model: undefined,
              type: 'info',
              content: content || '',
            });
            break;
          case 'warning':
            chatRecordingService?.recordMessage({
              model: undefined,
              type: 'warning',
              content: content || '',
            });
            break;
          case 'error':
            chatRecordingService?.recordMessage({
              model: undefined,
              type: 'error',
              content: content || '',
            });
            break;
          case 'user':
            // User messages are recorded by the input handler
            break;
          default:
            // Other types might not need recording or are recorded elsewhere
            break;
        }
      }

      return id; // Return the generated ID (even if not added, to keep signature)
    },
    [getNextMessageId, chatRecordingService],
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
      setHistory((prevHistory) =>
        prevHistory.map((item) => {
          if (item.id === id) {
            // Apply updates based on whether it's an object or a function
            const newUpdates =
              typeof updates === 'function' ? updates(item) : updates;
            return { ...item, ...newUpdates } as HistoryItem;
          }
          return item;
        }),
      );
    },
    [],
  );

  // Clears the entire history state and resets the ID counter.
  const clearItems = useCallback(() => {
    setHistory([]);
    messageIdCounterRef.current = 0;
  }, []);

  return useMemo(
    () => ({
      history,
      addItem,
      updateItem,
      clearItems,
      loadHistory,
    }),
    [history, addItem, updateItem, clearItems, loadHistory],
  );
}
