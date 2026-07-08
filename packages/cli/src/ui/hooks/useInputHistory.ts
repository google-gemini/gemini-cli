/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef } from 'react';
import { cpLen } from '../utils/textUtils.js';

interface UseInputHistoryProps {
  userMessages: readonly string[];
  onSubmit: (value: string) => void;
  isActive: boolean;
  currentQuery: string; // Renamed from query to avoid confusion
  currentCursorOffset: number;
  onChange: (value: string, cursorPosition?: 'start' | 'end' | number) => void;
}

export interface UseInputHistoryReturn {
  handleSubmit: (value: string) => void;
  navigateUp: () => boolean;
  navigateDown: () => boolean;
}

export function useInputHistory({
  userMessages,
  onSubmit,
  isActive,
  currentQuery,
  currentCursorOffset,
  onChange,
}: UseInputHistoryProps): UseInputHistoryReturn {
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // previousHistoryIndexRef tracks the index we occupied *immediately before* the current historyIndex.
  // This allows us to detect when we are "returning" to a level we just left.
  const previousHistoryIndexRef = useRef<number | undefined>(undefined);

  // Cache stores text and cursor offset for each history index level.
  // Level -1 is the current unsubmitted prompt.
  const historyCacheRef = useRef<
    Record<number, { text: string; offset: number }>
  >({});

  const resetHistoryNav = useCallback(() => {
    setHistoryIndex(-1);
    previousHistoryIndexRef.current = undefined;
    historyCacheRef.current = {};
  }, []);

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmedValue = value.trim();
      if (trimmedValue) {
        onSubmit(trimmedValue); // Parent handles clearing the query
      }
      resetHistoryNav();
    },
    [onSubmit, resetHistoryNav],
  );

  const navigateTo = useCallback(
    (nextIndex: number, defaultCursor: 'start' | 'end') => {
      const prevIndexBeforeMove = historyIndex;

      // 1. Save current state to cache before moving
      historyCacheRef.current[prevIndexBeforeMove] = {
        text: currentQuery,
        offset: currentCursorOffset,
      };

      // 2. Update index
      setHistoryIndex(nextIndex);

      // 3. Restore next state
      const saved = historyCacheRef.current[nextIndex];

      // We robustly restore the cursor position IF:
      // 1. We are returning to the compose prompt (-1)
      // 2. OR we are returning to the level we occupied *just before* the current one.
      // AND in both cases, the cursor was not at the very first or last character.
      const isReturningToPrevious =
        nextIndex === -1 || nextIndex === previousHistoryIndexRef.current;

      if (
        isReturningToPrevious &&
        saved &&
        saved.offset > 0 &&
        saved.offset < cpLen(saved.text)
      ) {
        onChange(saved.text, saved.offset);
      } else if (nextIndex === -1) {
        onChange(saved ? saved.text : '', defaultCursor);
      } else {
        // For regular history browsing, use default cursor position.
        if (saved) {
          onChange(saved.text, defaultCursor);
        } else {
          const newValue = userMessages[userMessages.length - 1 - nextIndex];
          onChange(newValue, defaultCursor);
        }
      }

      // Record the level we just came from for the next navigation
      previousHistoryIndexRef.current = prevIndexBeforeMove;
    },
    [historyIndex, currentQuery, currentCursorOffset, userMessages, onChange],
  );

  const navigateUp = useCallback(() => {
    if (!isActive) return false;
    if (userMessages.length === 0) return false;

    if (historyIndex < userMessages.length - 1) {
      navigateTo(historyIndex + 1, 'start');
      return true;
    }
    return false;
  }, [historyIndex, userMessages, isActive, navigateTo]);

  const navigateDown = useCallback(() => {
    if (!isActive) return false;
    if (historyIndex === -1) return false; // Not currently navigating history

    navigateTo(historyIndex - 1, 'end');
    return true;
  }, [historyIndex, isActive, navigateTo]);

  return {
    handleSubmit,
    navigateUp,
    navigateDown,
  };
}
