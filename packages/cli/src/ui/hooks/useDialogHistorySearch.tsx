/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { Box } from 'ink';
import { keyMatchers, Command } from '../keyMatchers.js';
import type { Key } from './useKeypress.js';
import type { TextBuffer } from '../components/shared/text-buffer.js';
import { useReverseSearchCompletion } from './useReverseSearchCompletion.js';
import { SuggestionsDisplay } from '../components/SuggestionsDisplay.js';
import { theme } from '../semantic-colors.js';

export interface DialogHistorySearchResult {
  commandSearchActive: boolean;
  /**
   * Key handler for search-related keys (Escape, Tab, Enter, Up/Down, Ctrl+R).
   * Returns `true` if the key was consumed, `false` otherwise.
   * Call this at the top of your `handleExtraKeys` callback.
   */
  handleSearchKeys: (key: Key) => boolean;
  /** Pre-built JSX for the suggestions dropdown, or `null` when inactive. */
  suggestionsNode: React.ReactNode | null;
  /** Prompt prefix text and color that changes during search. */
  promptPrefix: { text: string; color: string };
}

/**
 * Encapsulates Ctrl+R chat history search for dialog text inputs.
 * Reuses `useReverseSearchCompletion` and `SuggestionsDisplay` internally.
 *
 * @param buffer - The text buffer to search/fill into.
 * @param chatHistory - Chat history strings to search through.
 * @param isEnabled - Whether search activation is allowed (e.g. false when
 *   the custom option field is not focused in ChoiceQuestionView).
 * @param suggestionsWidth - Width for the suggestions display.
 */
export function useDialogHistorySearch(
  buffer: TextBuffer,
  chatHistory: readonly string[],
  isEnabled: boolean,
  suggestionsWidth: number,
): DialogHistorySearchResult {
  const [commandSearchActive, setCommandSearchActive] = useState(false);
  const [textBeforeSearch, setTextBeforeSearch] = useState('');

  const reversedHistory = useMemo(
    () => [...chatHistory].reverse(),
    [chatHistory],
  );

  const completion = useReverseSearchCompletion(
    buffer,
    reversedHistory,
    commandSearchActive,
  );

  const cancelSearch = useCallback(() => {
    setCommandSearchActive(false);
    completion.resetCompletionState();
    buffer.setText(textBeforeSearch);
  }, [buffer, completion, textBeforeSearch]);

  const acceptSearch = useCallback(() => {
    const { suggestions, activeSuggestionIndex, showSuggestions } = completion;
    if (
      showSuggestions &&
      suggestions.length > 0 &&
      activeSuggestionIndex >= 0
    ) {
      buffer.setText(suggestions[activeSuggestionIndex].value);
    }
    setCommandSearchActive(false);
    completion.resetCompletionState();
  }, [buffer, completion]);

  const handleSearchKeys = useCallback(
    (key: Key): boolean => {
      if (commandSearchActive) {
        if (keyMatchers[Command.ESCAPE](key)) {
          cancelSearch();
          return true;
        }
        if (keyMatchers[Command.ACCEPT_SUGGESTION_REVERSE_SEARCH](key)) {
          acceptSearch();
          return true;
        }
        if (keyMatchers[Command.SUBMIT_REVERSE_SEARCH](key)) {
          acceptSearch();
          return true;
        }
        if (keyMatchers[Command.NAVIGATION_UP](key)) {
          completion.navigateUp();
          return true;
        }
        if (keyMatchers[Command.NAVIGATION_DOWN](key)) {
          completion.navigateDown();
          return true;
        }
      }

      if (
        isEnabled &&
        keyMatchers[Command.REVERSE_SEARCH](key) &&
        chatHistory.length > 0
      ) {
        setCommandSearchActive(true);
        setTextBeforeSearch(buffer.text);
        return true;
      }

      return false;
    },
    [
      buffer,
      commandSearchActive,
      cancelSearch,
      acceptSearch,
      completion,
      isEnabled,
      chatHistory.length,
    ],
  );

  const suggestionsNode: React.ReactNode | null =
    commandSearchActive && completion.showSuggestions ? (
      <Box marginBottom={1}>
        <SuggestionsDisplay
          suggestions={completion.suggestions}
          activeIndex={completion.activeSuggestionIndex}
          isLoading={completion.isLoadingSuggestions}
          width={suggestionsWidth}
          scrollOffset={completion.visibleStartIndex}
          userInput={buffer.text}
          mode="reverse"
        />
      </Box>
    ) : null;

  const promptPrefix = commandSearchActive
    ? { text: '(r:) ', color: theme.text.accent }
    : { text: '> ', color: theme.status.success };

  return {
    commandSearchActive,
    handleSearchKeys,
    suggestionsNode,
    promptPrefix,
  };
}
