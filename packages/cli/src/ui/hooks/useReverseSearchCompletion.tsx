/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useCallback } from 'react';
import { useCompletion } from './useCompletion.js';
import { TextBuffer } from '../components/shared/text-buffer.js';
import { Suggestion } from '../components/SuggestionsDisplay.js';

export interface UseReverseSearchCompletionReturn {
  suggestions: Suggestion[];
  activeSuggestionIndex: number;
  visibleStartIndex: number;
  showSuggestions: boolean;
  isLoadingSuggestions: boolean;
  navigateUp: () => void;
  navigateDown: () => void;
  handleAutocomplete: (i: number) => void;
  resetCompletionState: () => void;
}

export function useReverseSearchCompletion(
  buffer: TextBuffer,
  shellHistory: readonly string[],
  reverseSearchActive: boolean,
): UseReverseSearchCompletionReturn {
  const {
    suggestions,
    activeSuggestionIndex,
    visibleStartIndex,
    showSuggestions,
    isLoadingSuggestions,

    setSuggestions,
    setShowSuggestions,
    setActiveSuggestionIndex,
    resetCompletionState,
    navigateUp,
    navigateDown,
  } = useCompletion();

  useEffect(() => {
    if (!reverseSearchActive) {
      resetCompletionState();
    }
  }, [reverseSearchActive, resetCompletionState]);

  useEffect(() => {
    if (!reverseSearchActive) {
      return;
    }

    const q = buffer.text.toLowerCase();
    const matches = shellHistory.reduce<Suggestion[]>((acc, cmd) => {
      const idx = cmd.toLowerCase().indexOf(q);
      if (idx !== -1) {
        acc.push({ label: cmd, value: cmd, matchedIndex: idx });
      }
      return acc;
    }, []);

    setSuggestions(matches);
    setShowSuggestions(matches.length > 0);
    setActiveSuggestionIndex(matches.length > 0 ? 0 : -1);
  }, [
    buffer.text,
    shellHistory,
    reverseSearchActive,
    setActiveSuggestionIndex,
    setShowSuggestions,
    setSuggestions,
  ]);

  const handleAutocomplete = useCallback(
    (i: number) => {
      if (i < 0 || i >= suggestions.length) return;
      buffer.setText(suggestions[i].value);
      resetCompletionState();
    },
    [buffer, suggestions, resetCompletionState],
  );

  return {
    suggestions,
    activeSuggestionIndex,
    visibleStartIndex,
    showSuggestions,
    isLoadingSuggestions,
    navigateUp,
    navigateDown,
    handleAutocomplete,
    resetCompletionState,
  };
}
