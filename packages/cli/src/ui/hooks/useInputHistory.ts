/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';

interface UseInputHistoryProps {
  userMessages: readonly string[];
  onSubmit: (value: string) => void;
  isActive: boolean;
  currentQuery: string; // Renamed from query to avoid confusion
  onChange: (value: string) => void;
}

interface UseInputHistoryReturn {
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
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [originalQueryBeforeNav, setOriginalQueryBeforeNav] =
    useState<string>('');

  const resetHistoryNav = useCallback(() => {
    setHistoryIndex(-1);
    setOriginalQueryBeforeNav('');
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

    let nextIndex = historyIndex;
    if (historyIndex === -1) {
      // Store the current query from the parent before navigating
      setOriginalQueryBeforeNav(currentQuery);
      nextIndex = 0;
    } else if (historyIndex < userMessages.length - 1) {
      nextIndex = historyIndex + 1;
    } else {
      return false; // Already at the oldest message
    }

    if (nextIndex !== historyIndex) {
      setHistoryIndex(nextIndex);
      const newValue = userMessages[userMessages.length - 1 - nextIndex];
      onChange(newValue);
      return true;
    }
    return false;
  }, [
    historyIndex,
    setHistoryIndex,
    onChange,
    userMessages,
    isActive,
    currentQuery, // Use currentQuery from props
    setOriginalQueryBeforeNav,
  ]);

  const navigateDown = useCallback(() => {
    if (!isActive) return false;
    if (historyIndex === -1) return false; // Not currently navigating history

    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);

    if (nextIndex === -1) {
      // Reached the end of history navigation, restore original query
      onChange(originalQueryBeforeNav);
    } else {
      const newValue = userMessages[userMessages.length - 1 - nextIndex];
      onChange(newValue);
    }
    return true;
  }, [
    historyIndex,
    setHistoryIndex,
    originalQueryBeforeNav,
    onChange,
    userMessages,
    isActive,
  ]);

  return {
    handleSubmit,
    navigateUp,
    navigateDown,
  };
}
