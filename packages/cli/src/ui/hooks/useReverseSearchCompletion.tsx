/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useCompletion } from './useCompletion.js';
import type { TextBuffer } from '../components/shared/text-buffer.js';
import type { Suggestion } from '../components/SuggestionsDisplay.js';

function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

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
  history: readonly string[],
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
    setVisibleStartIndex,
  } = useCompletion();

  const debouncedQuery = useDebouncedValue(buffer.text, 100);

  // incremental search
  const prevQueryRef = useRef<string>('');
  const prevMatchesRef = useRef<Suggestion[]>([]);

  // Clear incremental cache when activating reverse search
  useEffect(() => {
    if (reverseSearchActive) {
      prevQueryRef.current = '';
      prevMatchesRef.current = [];
    }
  }, [reverseSearchActive]);

  // Also clear cache when history changes so new items are considered
  useEffect(() => {
    prevQueryRef.current = '';
    prevMatchesRef.current = [];
  }, [history]);

  const searchHistory = useCallback(
    (query: string, items: readonly string[]) => {
      const out: Suggestion[] = [];
      for (let i = 0; i < items.length; i++) {
        const cmd = items[i];
        const idx = cmd.toLowerCase().indexOf(query);
        if (idx !== -1) {
          out.push({ label: cmd, value: cmd, matchedIndex: idx });
        }
      }
      return out;
    },
    [],
  );

  const matches = useMemo<Suggestion[]>(() => {
    if (!reverseSearchActive) return [];
    if (debouncedQuery.length === 0)
      return history.map((cmd) => ({
        label: cmd,
        value: cmd,
        matchedIndex: -1,
      }));

    const query = debouncedQuery.toLowerCase();
    const canUseCache =
      prevQueryRef.current &&
      query.startsWith(prevQueryRef.current) &&
      prevMatchesRef.current.length > 0;

    const source = canUseCache
      ? prevMatchesRef.current.map((m) => m.value)
      : history;

    return searchHistory(query, source);
  }, [debouncedQuery, history, reverseSearchActive, searchHistory]);

  useEffect(() => {
    if (!reverseSearchActive) {
      resetCompletionState();
      return;
    }

    setSuggestions(matches);
    const hasAny = matches.length > 0;
    setShowSuggestions(hasAny);
    setActiveSuggestionIndex(hasAny ? 0 : -1);
    setVisibleStartIndex(0);

    prevQueryRef.current = debouncedQuery.toLowerCase();
    prevMatchesRef.current = matches;
  }, [
    debouncedQuery,
    matches,
    reverseSearchActive,
    setSuggestions,
    setShowSuggestions,
    setActiveSuggestionIndex,
    setVisibleStartIndex,
    resetCompletionState,
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
