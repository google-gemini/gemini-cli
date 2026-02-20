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

const MIN_VIEWPORT_WIDTH = 20;
const VIEWPORT_WIDTH_OFFSET = 8;

export interface UseRegistrySearchResult<T extends GenericListItem> {
  filteredItems: T[];
  searchBuffer: TextBuffer | undefined;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  maxLabelWidth: number;
}

export function useRegistrySearch<T extends GenericListItem>(props: {
  items: T[];
  initialQuery?: string;
  onSearch?: (query: string) => void;
}): UseRegistrySearchResult<T> {
  const { items, initialQuery = '', onSearch } = props;

  const [searchQuery, setSearchQuery] = useState(initialQuery);

  useEffect(() => {
    onSearch?.(searchQuery);
  }, [searchQuery, onSearch]);

  const { mainAreaWidth } = useUIState();
  const viewportWidth = Math.max(
    MIN_VIEWPORT_WIDTH,
    mainAreaWidth - VIEWPORT_WIDTH_OFFSET,
  );

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

  const maxLabelWidth = 0;

  const filteredItems = items;

  return {
    filteredItems,
    searchBuffer,
    searchQuery,
    setSearchQuery,
    maxLabelWidth,
  };
}
