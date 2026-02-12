/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import { AsyncFzf } from 'fzf';
import { useUIState } from '../contexts/UIStateContext.js';
import {
  useTextBuffer,
  type TextBuffer,
} from '../components/shared/text-buffer.js';
import { getCachedStringWidth } from '../utils/textUtils.js';

interface FzfResult {
  item: string;
  start: number;
  end: number;
  score: number;
  positions?: number[];
}

export interface GenericListItem {
  key: string;
  label: string;
  description?: string;
  scopeMessage?: string;
}

export interface UseFuzzyListProps<T extends GenericListItem> {
  items: T[];
  initialQuery?: string;
  onSearch?: (query: string) => void;
}

export interface UseFuzzyListResult<T extends GenericListItem> {
  filteredItems: T[];
  searchBuffer: TextBuffer | undefined;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  maxLabelWidth: number;
}

export function useFuzzyList<T extends GenericListItem>({
  items,
  initialQuery = '',
  onSearch,
}: UseFuzzyListProps<T>): UseFuzzyListResult<T> {
  // Search state
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [filteredKeys, setFilteredKeys] = useState<string[]>(() =>
    items.map((i) => i.key),
  );

  // FZF instance for fuzzy searching
  const { fzfInstance, searchMap } = useMemo(() => {
    const map = new Map<string, string>();
    const searchItems: string[] = [];

    items.forEach((item) => {
      searchItems.push(item.label);
      map.set(item.label.toLowerCase(), item.key);
    });

    const fzf = new AsyncFzf(searchItems, {
      fuzzy: 'v2',
      casing: 'case-insensitive',
    });
    return { fzfInstance: fzf, searchMap: map };
  }, [items]);

  // Perform search
  useEffect(() => {
    let active = true;
    if (!searchQuery.trim() || !fzfInstance) {
      setFilteredKeys(items.map((i) => i.key));
      return;
    }

    const doSearch = async () => {
      const results = await fzfInstance.find(searchQuery);

      if (!active) return;

      const matchedKeys = new Set<string>();
      results.forEach((res: FzfResult) => {
        const key = searchMap.get(res.item.toLowerCase());
        if (key) matchedKeys.add(key);
      });
      setFilteredKeys(Array.from(matchedKeys));
      onSearch?.(searchQuery);
    };

    void doSearch().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Search failed:', error);
      setFilteredKeys(items.map((i) => i.key)); // Reset to all items on error
    });

    return () => {
      active = false;
    };
  }, [searchQuery, fzfInstance, searchMap, items, onSearch]);

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

  // Filtered items to display
  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    return items.filter((item) => filteredKeys.includes(item.key));
  }, [items, filteredKeys, searchQuery]);

  // Calculate max label width for alignment
  const maxLabelWidth = useMemo(() => {
    let max = 0;
    // We use all items for consistent alignment even when filtered
    items.forEach((item) => {
      const labelFull =
        item.label + (item.scopeMessage ? ` ${item.scopeMessage}` : '');
      const lWidth = getCachedStringWidth(labelFull);
      const dWidth = item.description
        ? getCachedStringWidth(item.description)
        : 0;
      max = Math.max(max, lWidth, dWidth);
    });
    return max;
  }, [items]);

  return {
    filteredItems,
    searchBuffer,
    searchQuery,
    setSearchQuery,
    maxLabelWidth,
  };
}
