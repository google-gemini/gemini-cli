/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { useInput } from 'ink';

interface UseInputHistoryProps {
  userMessages: readonly string[];
  onSubmit: (value: string) => void;
  isActive: boolean;
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
}

interface UseInputHistoryReturn {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  handleSubmit: (value: string) => void;
  inputKey: number;
  setInputKey: React.Dispatch<React.SetStateAction<number>>;
}

export function useInputHistory({
  userMessages,
  onSubmit,
  isActive,
  query,
  setQuery,
}: UseInputHistoryProps): UseInputHistoryReturn {
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [originalQueryBeforeNav, setOriginalQueryBeforeNav] =
    useState<string>('');
  const [inputKey, setInputKey] = useState<number>(0);

  const resetHistoryNav = useCallback(() => {
    setHistoryIndex(-1);
    setOriginalQueryBeforeNav('');
  }, []);

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmedValue = value.trim();
      if (trimmedValue) {
        onSubmit(trimmedValue); // This will call handleFinalSubmit, which then calls setQuery('') from App.tsx
      }
      resetHistoryNav();
    },
    [onSubmit, resetHistoryNav],
  );

  useInput(
    (input, key) => {
      if (!isActive) {
        return;
      }

      let didNavigate = false;

      if (key.upArrow) {
        if (userMessages.length === 0) return;

        let nextIndex = historyIndex;
        if (historyIndex === -1) {
          setOriginalQueryBeforeNav(query);
          nextIndex = 0;
        } else if (historyIndex < userMessages.length - 1) {
          nextIndex = historyIndex + 1;
        } else {
          return;
        }

        if (nextIndex !== historyIndex) {
          setHistoryIndex(nextIndex);
          const newValue = userMessages[userMessages.length - 1 - nextIndex];
          setQuery(newValue);
          setInputKey((k) => k + 1);
          didNavigate = true;
        }
      } else if (key.downArrow) {
        if (historyIndex === -1) return;

        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);

        if (nextIndex === -1) {
          setQuery(originalQueryBeforeNav);
        } else {
          const newValue = userMessages[userMessages.length - 1 - nextIndex];
          setQuery(newValue);
        }
        setInputKey((k) => k + 1);
        didNavigate = true;
      } else {
        if (historyIndex !== -1 && !didNavigate) {
          if (input || key.backspace || key.delete) {
            resetHistoryNav();
          }
        }
      }
    },
    { isActive },
  );

  return {
    query,
    setQuery,
    handleSubmit,
    inputKey,
    setInputKey,
  };
}
