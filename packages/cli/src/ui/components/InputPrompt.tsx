/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { Text, Box, useInput, useFocus, Key } from 'ink';
import TextInput from 'ink-text-input';
import { Colors } from '../colors.js';
import { Suggestion } from './SuggestionsDisplay.js';

interface InputPromptProps {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  inputKey: number;
  setInputKey: React.Dispatch<React.SetStateAction<number>>;
  onSubmit: (value: string) => void;
  showSuggestions: boolean;
  suggestions: Suggestion[]; // Changed to Suggestion[]
  activeSuggestionIndex: number;
  navigateUp: () => void;
  navigateDown: () => void;
  resetCompletion: () => void;
}

export const InputPrompt: React.FC<InputPromptProps> = ({
  query,
  setQuery,
  inputKey,
  setInputKey,
  onSubmit,
  showSuggestions,
  suggestions,
  activeSuggestionIndex,
  navigateUp,
  navigateDown,
  resetCompletion,
}) => {
  const { isFocused } = useFocus({ autoFocus: true });

  const handleAutocomplete = useCallback(() => {
    if (
      activeSuggestionIndex < 0 ||
      activeSuggestionIndex >= suggestions.length
    ) {
      return;
    }
    const selectedSuggestion = suggestions[activeSuggestionIndex];
    const trimmedQuery = query.trimStart();

    if (trimmedQuery.startsWith('/')) {
      // Handle / command completion
      const slashIndex = query.indexOf('/');
      const base = query.substring(0, slashIndex + 1);
      const newValue = base + selectedSuggestion.value;
      setQuery(newValue);
    } else {
      // Handle @ command completion
      const atIndex = query.lastIndexOf('@');
      if (atIndex === -1) return;

      // Find the part of the query after the '@'
      const pathPart = query.substring(atIndex + 1);
      // Find the last slash within that part
      const lastSlashIndexInPath = pathPart.lastIndexOf('/');

      let base = '';
      if (lastSlashIndexInPath === -1) {
        // No slash after '@', replace everything after '@'
        base = query.substring(0, atIndex + 1);
      } else {
        // Slash found, keep everything up to and including the last slash
        base = query.substring(0, atIndex + 1 + lastSlashIndexInPath + 1);
      }

      const newValue = base + selectedSuggestion.value;
      setQuery(newValue);
    }

    resetCompletion(); // Hide suggestions after selection
    setInputKey((k) => k + 1); // Increment key to force re-render and cursor reset
  }, [
    query,
    setQuery,
    suggestions,
    activeSuggestionIndex,
    resetCompletion,
    setInputKey,
  ]);

  useInput(
    (input: string, key: Key) => {
      let handled = false;

      if (showSuggestions) {
        if (key.upArrow) {
          navigateUp();
          handled = true;
        } else if (key.downArrow) {
          navigateDown();
          handled = true;
        } else if ((key.tab || key.return) && activeSuggestionIndex >= 0) {
          handleAutocomplete();
          handled = true;
        } else if (key.escape) {
          resetCompletion();
          handled = true;
        }
      }

      // Only submit on Enter if it wasn't handled above
      if (!handled && key.return) {
        if (query.trim()) {
          onSubmit(query);
        }
        handled = true;
      }

      if (
        handled &&
        showSuggestions &&
        (key.upArrow || key.downArrow || key.tab || key.escape || key.return)
      ) {
        // No explicit preventDefault needed, handled flag stops further processing
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box borderStyle="round" borderColor={Colors.AccentBlue} paddingX={1}>
      <Text color={Colors.AccentPurple}>&gt; </Text>
      <Box flexGrow={1}>
        <TextInput
          key={inputKey.toString()}
          value={query}
          onChange={setQuery}
          placeholder="Enter your message or use tools (e.g., @src/file.txt)..."
          onSubmit={() => {
            /* onSubmit is handled by useInput hook above */
          }}
        />
      </Box>
    </Box>
  );
};
