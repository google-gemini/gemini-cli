/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import type { HistoryItem } from '../types.js';
import { VERBOSITY_MAPPING, Verbosity } from '../types.js';
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
  verbosity = 'info',
}: {
  chatRecordingService?: ChatRecordingService | null;
  verbosity?: string;
} = {}): UseHistoryManagerReturn {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const messageIdCounterRef = useRef(0);

  // Generates a unique message ID based on a timestamp and a counter.
  const getNextMessageId = useCallback((baseTimestamp: number): number => {
    messageIdCounterRef.current += 1;
    return baseTimestamp + messageIdCounterRef.current;
  }, []);

  const loadHistory = useCallback((newHistory: HistoryItem[]) => {
    setHistory(newHistory);
  }, []);

  // Adds a new item to the history state with a unique ID.
  const addItem = useCallback(
    (
      itemData: Omit<HistoryItem, 'id'>,
      baseTimestamp: number = Date.now(),
      isResuming: boolean = false,
    ): number => {
      // Cast to string to safely index into VERBOSITY_MAPPING
      const itemType = itemData.type as string;
      const currentVerbosity =
        VERBOSITY_MAPPING[verbosity ?? 'info'] ?? Verbosity.INFO;
      const itemVerbosity =
        itemData.verbosity ?? VERBOSITY_MAPPING[itemType] ?? Verbosity.INFO;

      if (itemVerbosity > currentVerbosity) {
        // Skip adding the item to the UI history if it exceeds the current verbosity level
        return -1;
      }

      const id = getNextMessageId(baseTimestamp);
      const newItem: HistoryItem = { ...itemData, id } as HistoryItem;

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
        return [...prevHistory, newItem];
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
          case 'gemini':
          case 'gemini_content':
            // Core conversation recording handled by GeminiChat.
            break;
          default:
            // Ignore the rest.
            break;
        }
      }

      return id; // Return the generated ID (even if not added, to keep signature)
    },
    [getNextMessageId, chatRecordingService, verbosity],
  );

  /**
   * Updates an existing history item identified by its ID.
   * @deprecated Prefer not to update history item directly as we are currently
   * rendering all history items in <Static /> for performance reasons. Only use
   * if ABSOLUTELY NECESSARY
   */
  //
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
