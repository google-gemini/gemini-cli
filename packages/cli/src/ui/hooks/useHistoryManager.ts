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
  initialItems = [],
}: {
  chatRecordingService?: ChatRecordingService | null;
  initialItems?: HistoryItem[];
} = {}): UseHistoryManagerReturn {
  const [history, setHistory] = useState<HistoryItem[]>(initialItems);
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
      const id = getNextMessageId(baseTimestamp);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const newItem: HistoryItem = { ...itemData, id } as HistoryItem;

      setHistory((prevHistory) => {
        const lastItem =
          prevHistory.length > 0 ? prevHistory[prevHistory.length - 1] : null;

        // If the last item and the new item are both tool groups, merge them.
        if (
          lastItem &&
          lastItem.type === 'tool_group' &&
          newItem.type === 'tool_group'
        ) {
          const updatedLastItem: HistoryItem = {
            ...lastItem,
            tools: [...lastItem.tools, ...newItem.tools],
            borderBottom: newItem.borderBottom,
          };
          return [...prevHistory.slice(0, -1), updatedLastItem];
        }

        // Prevent adding duplicate consecutive user messages
        if (
          lastItem &&
          lastItem.type === 'user' &&
          newItem.type === 'user' &&
          lastItem.text === newItem.text
        ) {
          return prevHistory; // Don't add the duplicate
        }
        return [...prevHistory, newItem];
      });

      // Record UI-specific messages, but don't do it if we're actually loading
      // an existing session.
      if (!isResuming && chatRecordingService) {
        // Safe access to text property
        const content = itemData.text || '';

        switch (itemData.type) {
          case 'compression':
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
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
