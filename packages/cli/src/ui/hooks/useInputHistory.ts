/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { useInput } from 'ink';

// Props for the hook
interface UseInputHistoryProps {
  userMessages: readonly string[]; // History of user messages
  onSubmit: (value: string) => void; // Original submit function from App
  isActive: boolean; // To enable/disable the useInput hook
}

// Return type of the hook
interface UseInputHistoryReturn {
  query: string; // The current input query managed by the hook
  setQuery: React.Dispatch<React.SetStateAction<string>>; // Setter for the query
  handleSubmit: (value: string) => void; // Wrapped submit handler
  inputKey: number; // Key to force input reset
}

export function useInputHistory({
  userMessages,
  onSubmit,
  isActive,
}: UseInputHistoryProps): UseInputHistoryReturn {
  const [query, setQuery] = useState(''); // Hook manages its own query state
  const [historyIndex, setHistoryIndex] = useState<number>(-1); // -1 means current query
  const [originalQueryBeforeNav, setOriginalQueryBeforeNav] =
    useState<string>('');
  const [inputKey, setInputKey] = useState<number>(0); // Key for forcing input reset

  // Function to reset navigation state, called on submit or manual reset
  const resetHistoryNav = useCallback(() => {
    setHistoryIndex(-1);
    setOriginalQueryBeforeNav('');
  }, []);

  // Wrapper for the onSubmit prop to include resetting history navigation
  const handleSubmit = useCallback(
    (value: string) => {
      const trimmedValue = value.trim();
      if (trimmedValue) {
        // Only submit non-empty values
        onSubmit(trimmedValue); // Call the original submit function
      }
      setQuery(''); // Clear the input field managed by this hook
      resetHistoryNav(); // Reset history state
      // Don't increment inputKey here, only on nav changes
    },
    [onSubmit, resetHistoryNav],
  );

  useInput(
    (input, key) => {
      // Do nothing if the hook is not active
      if (!isActive) {
        return;
      }

      let didNavigate = false;

      if (key.upArrow) {
        if (userMessages.length === 0) return;

        let nextIndex = historyIndex;
        if (historyIndex === -1) {
          // Starting navigation UP, save current input
          setOriginalQueryBeforeNav(query);
          nextIndex = 0; // Go to the most recent item (index 0 in reversed view)
        } else if (historyIndex < userMessages.length - 1) {
          // Continue navigating UP (towards older items)
          nextIndex = historyIndex + 1;
        } else {
          return; // Already at the oldest item
        }

        if (nextIndex !== historyIndex) {
          setHistoryIndex(nextIndex);
          // History is ordered newest to oldest, so access from the end
          const newValue = userMessages[userMessages.length - 1 - nextIndex];
          setQuery(newValue);
          setInputKey((k) => k + 1); // Increment key on navigation change
          didNavigate = true;
        }
      } else if (key.downArrow) {
        if (historyIndex === -1) return; // Already at the bottom (current input)

        const nextIndex = historyIndex - 1; // Move towards more recent items / current input
        setHistoryIndex(nextIndex);

        if (nextIndex === -1) {
          // Restore original query
          setQuery(originalQueryBeforeNav);
        } else {
          // Set query based on reversed index
          const newValue = userMessages[userMessages.length - 1 - nextIndex];
          setQuery(newValue);
        }
        setInputKey((k) => k + 1); // Increment key on navigation change
        didNavigate = true;
      } else {
        // If user types anything other than arrows while navigating, reset history navigation state
        if (historyIndex !== -1 && !didNavigate) {
          // Check if it's a key that modifies input content
          if (input || key.backspace || key.delete) {
            resetHistoryNav();
            // The actual query state update for typing is handled by the component's onChange calling setQuery
          }
        }
      }
    },
    { isActive }, // Pass isActive to useInput
  );

  return {
    query,
    setQuery, // Return the hook's setQuery
    handleSubmit, // Return the wrapped submit handler
    inputKey, // Return the key
  };
}
