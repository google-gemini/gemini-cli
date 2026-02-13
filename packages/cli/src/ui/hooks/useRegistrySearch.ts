/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  useTextBuffer,
  type TextBuffer,
} from '../components/shared/text-buffer.js';
import { useUIState } from '../contexts/UIStateContext.js';
import type { GenericListItem } from '../components/shared/SearchableList.js';

export interface UseRegistrySearchResult<T extends GenericListItem> {
  filteredItems: T[];
  searchBuffer: TextBuffer | undefined;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  maxLabelWidth: number;
}

export function useRegistrySearch<T extends GenericListItem>(props: {
  items: T[]; // These are just the cached/initial items
  initialQuery?: string;
  onSearch?: (query: string) => void;
}): UseRegistrySearchResult<T> {
  const { items, initialQuery = '', onSearch } = props;

  // Search state
  const [searchQuery, setSearchQuery] = useState(initialQuery);

  // Trigger onSearch when query changes
  useEffect(() => {
    onSearch?.(searchQuery);
  }, [searchQuery, onSearch]);

  // Get mainAreaWidth for search buffer viewport from UIState
  const { mainAreaWidth } = useUIState();
  const viewportWidth = Math.max(20, mainAreaWidth - 8);

  // Search input buffer
  const searchBuffer = useTextBuffer({
    initialText: searchQuery,
    initialCursorOffset: searchQuery.length,
    viewport: {
      width: viewportWidth,
      height: 1,
    },
    singleLine: true,
    onChange: (text) => setSearchQuery(text),
  });

  // Calculate max label width (not really used in custom renderer but good for API consistency)
  const maxLabelWidth = 0;

  // In this model, "filteredItems" is just what the parent passed down,
  // because the parent (ExtensionRegistryView) is doing the fetching/filtering
  // based on the onSearch callback we triggered.
  const filteredItems = items;

  return {
    filteredItems,
    searchBuffer,
    searchQuery,
    setSearchQuery,
    maxLabelWidth,
  };
}
