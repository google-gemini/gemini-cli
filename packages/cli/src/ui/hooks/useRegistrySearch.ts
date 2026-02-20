/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import type { TextBuffer } from '../components/shared/text-buffer.js';
import type { GenericListItem } from '../components/shared/SearchableList.js';
import { useSearchBuffer } from './useSearchBuffer.js';

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
  const isFirstRender = useRef(true);
  const onSearchRef = useRef(onSearch);

  onSearchRef.current = onSearch;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onSearchRef.current?.(searchQuery);
  }, [searchQuery]);

  const searchBuffer = useSearchBuffer({
    initialText: searchQuery,
    onChange: setSearchQuery,
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
