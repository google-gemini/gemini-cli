/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseInputHistoryProps {
  userMessages: readonly string[];
  onSubmit: (value: string) => void;
  isActive: boolean;
  currentQuery: string;
  onChange: (value: string) => void;
}

export const useInputHistory = ({
  userMessages,
  onSubmit,
  isActive,
  currentQuery,
  onChange,
}: UseInputHistoryProps) => {
  const [historyIndex, setHistoryIndex] = useState(-1);
  const originalQueryBeforeNav = useRef('');

  // When messages change, reset the history pointer.
  useEffect(() => {
    setHistoryIndex(-1);
  }, [userMessages]);

  const handleSubmit = (value: string) => {
    const trimmedValue = value.trim();
    if (trimmedValue) {
      onSubmit(trimmedValue);
    }
    setHistoryIndex(-1);
    originalQueryBeforeNav.current = '';
  };

  const navigateUp = useCallback(() => {
    if (!isActive || userMessages.length === 0) {
      return false;
    }

    if (historyIndex === -1) {
      originalQueryBeforeNav.current = currentQuery;
      const newIndex = userMessages.length - 1;
      onChange(userMessages[newIndex]);
      setHistoryIndex(newIndex);
    } else {
      const newIndex = Math.max(0, historyIndex - 1);
      if (newIndex !== historyIndex) {
        onChange(userMessages[newIndex]);
        setHistoryIndex(newIndex);
      }
    }
    return true;
  }, [isActive, historyIndex, userMessages, onChange, currentQuery]);

  const navigateDown = useCallback(() => {
    if (!isActive || historyIndex === -1) {
      return false;
    }

    const newIndex = historyIndex + 1;
    if (newIndex < userMessages.length) {
      onChange(userMessages[newIndex]);
      setHistoryIndex(newIndex);
    } else {
      // Reached the bottom, restore the originally edited query.
      onChange(originalQueryBeforeNav.current);
      setHistoryIndex(-1);
    }
    return true;
  }, [isActive, historyIndex, userMessages, onChange]);

  const resetHistory = useCallback(() => {
    setHistoryIndex(-1);
    originalQueryBeforeNav.current = '';
  }, []);

  return { navigateUp, navigateDown, resetHistory, handleSubmit };
};
