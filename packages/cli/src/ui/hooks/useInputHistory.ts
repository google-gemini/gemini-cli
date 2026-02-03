/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef } from 'react';

interface UseInputHistoryProps {
  userMessages: readonly string[];
  onSubmit: (value: string) => void;
  isActive: boolean;
  currentQuery: string; // Renamed from query to avoid confusion
  onChange: (value: string) => void;
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
  onChange,
}: UseInputHistoryProps): UseInputHistoryReturn {
  const currentQueryRef = useRef(currentQuery);
  const historyIndexRef = useRef<number>(-1);
  const originalQueryBeforeNavRef = useRef<string>('');

  useEffect(() => {
    currentQueryRef.current = currentQuery;
  }, [currentQuery]);

  const resetHistoryNav = useCallback(() => {
    historyIndexRef.current = -1;
    originalQueryBeforeNavRef.current = '';
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

  const navigateUp = useCallback(() => {
    if (!isActive) return false;
    if (userMessages.length === 0) return false;

    let nextIndex = historyIndexRef.current;
    if (historyIndexRef.current === -1) {
      // Store the current query from the parent before navigating
      originalQueryBeforeNavRef.current = currentQueryRef.current;
      nextIndex = 0;
    } else if (historyIndexRef.current < userMessages.length - 1) {
      nextIndex = historyIndexRef.current + 1;
    } else {
      return false; // Already at the oldest message
    }

    if (nextIndex !== historyIndexRef.current) {
      historyIndexRef.current = nextIndex;
      const newValue = userMessages[userMessages.length - 1 - nextIndex];
      onChange(newValue);
      return true;
    }
    return false;
  }, [onChange, userMessages, isActive]);

  const navigateDown = useCallback(() => {
    if (!isActive) return false;
    if (historyIndexRef.current === -1) return false; // Not currently navigating history

    const nextIndex = historyIndexRef.current - 1;
    historyIndexRef.current = nextIndex;

    if (nextIndex === -1) {
      // Reached the end of history navigation, restore original query
      onChange(originalQueryBeforeNavRef.current);
    } else {
      const newValue = userMessages[userMessages.length - 1 - nextIndex];
      onChange(newValue);
    }
    return true;
  }, [onChange, userMessages, isActive]);

  return {
    handleSubmit,
    navigateUp,
    navigateDown,
  };
}
