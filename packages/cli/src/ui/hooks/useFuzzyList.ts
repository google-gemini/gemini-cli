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
  disableFiltering?: boolean;
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
  disableFiltering = false,
}: UseFuzzyListProps<T>): UseFuzzyListResult<T> {
  // Search state
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [filteredKeys, setFilteredKeys] = useState<string[]>(() =>
    items.map((i) => i.key),
  );

  // FZF instance for fuzzy searching
  // FZF instance for fuzzy searching - skip if filtering is disabled
  const fzfInstance = useMemo(() => {
    if (disableFiltering) return null;
    return new AsyncFzf(items, {
      fuzzy: 'v2',
      casing: 'case-insensitive',
      selector: (item: T) => item.label,
    });
  }, [items, disableFiltering]);

  // Perform search
  useEffect(() => {
    let active = true;
    if (!searchQuery.trim() || (!fzfInstance && !disableFiltering)) {
      setFilteredKeys(items.map((i) => i.key));
      return;
    }

    const doSearch = async () => {
      // If filtering is disabled, or no query/fzf, just return all items (or handle external search elsewhere)
      if (disableFiltering) {
        onSearch?.(searchQuery);
        // When filtering is disabled, we assume the items passed in are already filtered
        // so we set filteredKeys to all items
        const allKeys = items.map((i) => i.key);
        setFilteredKeys((prev) => {
          if (
            prev.length === allKeys.length &&
            prev.every((key, index) => key === allKeys[index])
          ) {
            return prev;
          }
          return allKeys;
        });
        return;
      }

      if (fzfInstance) {
        const results = await fzfInstance.find(searchQuery);

        if (!active) return;

        const matchedKeys = results.map((res: { item: T }) => res.item.key);
        setFilteredKeys((prev) => {
          if (
            prev.length === matchedKeys.length &&
            prev.every((key, index) => key === matchedKeys[index])
          ) {
            return prev;
          }
          return matchedKeys;
        });
        onSearch?.(searchQuery);
      }
    };

    void doSearch().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Search failed:', error);
      const allKeys = items.map((i) => i.key);
      setFilteredKeys((prev) => {
        if (
          prev.length === allKeys.length &&
          prev.every((key, index) => key === allKeys[index])
        ) {
          return prev;
        }
        return allKeys;
      });
    });

    return () => {
      active = false;
    };
  }, [searchQuery, fzfInstance, items, onSearch, disableFiltering]);

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
    if (disableFiltering) return items;
    if (!searchQuery) return items;
    return items.filter((item) => filteredKeys.includes(item.key));
  }, [items, filteredKeys, searchQuery, disableFiltering]);

  // Calculate max label width for alignment
  const maxLabelWidth = useMemo(() => {
    let max = 0;
    // We use all items for consistent alignment even when filtered
    items.forEach((item) => {
      const labelFull =
        item.label + (item.scopeMessage ? ` ${item.scopeMessage}` : '');
      const lWidth = getCachedStringWidth(labelFull);
      max = Math.max(max, lWidth);
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
