/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo } from 'react';
import { getNextHistoryId } from '../utils/historyIdGenerator.js';
import { debugLogger } from '@google/gemini-cli-core';
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

  const loadHistory = useCallback((newHistory: HistoryItem[]) => {
    const historyWithIds = newHistory.map((item) =>
      item.id !== undefined
        ? item
        : ({ ...item, id: getNextHistoryId() } as HistoryItem),
    );
    setHistory(historyWithIds.sort((a, b) => a.id - b.id));
  }, []);

  // Adds a new item to the history state with a unique ID.
  const addItem = useCallback(
    (
      itemData: Omit<HistoryItem, 'id'>,
      _baseTimestamp?: number, // Kept for backwards compatibility
      isResuming: boolean = false,
    ): number => {
      const id = getNextHistoryId();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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

        const nextHistory = [...prevHistory, newItem].sort(
          (a, b) => a.id - b.id,
        );

        if (process.env['NODE_ENV'] === 'development') {
          const wasOutOfOrder =
            prevHistory.length > 0 &&
            prevHistory[prevHistory.length - 1].id > newItem.id;
          if (wasOutOfOrder) {
            debugLogger.warn(
              `[HistoryManager] Detected out-of-order history ID: ${newItem.id} added after ${prevHistory[prevHistory.length - 1].id}. Array was sorted to correct this.`,
            );
          }
        }

        return nextHistory;
      });

      // Record UI-specific messages, but don't do it if we're actually loading
      // an existing session.
      if (!isResuming && chatRecordingService) {
        switch (itemData.type) {
          case 'compression':
          case 'info':
            chatRecordingService?.recordMessage({
              model: undefined,
              type: 'info',
              content: itemData.text ?? '',
            });
            break;
          case 'warning':
            chatRecordingService?.recordMessage({
              model: undefined,
              type: 'warning',
              content: itemData.text ?? '',
            });
            break;
          case 'error':
            chatRecordingService?.recordMessage({
              model: undefined,
              type: 'error',
              content: itemData.text ?? '',
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
    [chatRecordingService],
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
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            return { ...item, ...newUpdates } as HistoryItem;
          }
          return item;
        }),
      );
    },
    [],
  );

  // Clears the entire history state. Global ID counter is NOT reset.
  const clearItems = useCallback(() => {
    setHistory([]);
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
