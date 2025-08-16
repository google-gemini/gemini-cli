/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';

export interface UseReverseHistorySearchProps {
  history: readonly string[];
  onSearch: (result: string) => void;
}

export const useReverseHistorySearch = ({
  history,
  onSearch,
}: UseReverseHistorySearchProps) => {
  const [searchTerm, setSearchTerm] = useState<string | null>(null);
  const [matchIndex, setMatchIndex] = useState(-1);

  const search = (term: string, startIndex: number) => {
    for (let i = startIndex; i >= 0; i--) {
      if (history[i].includes(term)) {
        setMatchIndex(i);
        onSearch(history[i]);
        return;
      }
    }
  };

  const startSearch = (newTerm: string) => {
    setSearchTerm(newTerm);
    search(newTerm, history.length - 1);
  };

  const continueSearch = () => {
    if (searchTerm === null) return;

    for (let i = matchIndex - 1; i >= 0; i--) {
      if (
        history[i].includes(searchTerm) &&
        history[i] !== history[matchIndex]
      ) {
        setMatchIndex(i);
        onSearch(history[i]);
        return;
      }
    }
  };

  const navigateUp = () => {
    const newIndex = matchIndex > 0 ? matchIndex - 1 : 0;
    setMatchIndex(newIndex);
    onSearch(history[newIndex]);
  };

  const navigateDown = () => {
    const newIndex =
      matchIndex < history.length - 1 ? matchIndex + 1 : history.length - 1;
    setMatchIndex(newIndex);
    onSearch(history[newIndex]);
  };

  const stopSearch = useCallback(() => {
    setSearchTerm(null);
    setMatchIndex(-1);
  }, []);

  return {
    startSearch,
    continueSearch,
    navigateUp,
    navigateDown,
    stopSearch,
    isActive: searchTerm !== null,
    searchTerm,
  };
};
