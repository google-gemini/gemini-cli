/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { AsyncFzf } from 'fzf';
import {
  BaseSettingsDialog,
  type SettingsDialogItem,
  type BaseSettingsDialogProps,
} from './BaseSettingsDialog.js';
import { useTextBuffer } from './text-buffer.js';
import { useUIState } from '../../contexts/UIStateContext.js';

import { getCachedStringWidth } from '../../utils/textUtils.js';

interface FzfResult {
  item: string;
  start: number;
  end: number;
  score: number;
  positions?: number[];
}

/**
 * SearchableListProps extends BaseSettingsDialogProps but removes props that are handled internally
 * or derived from the items and search state.
 */
export interface SearchableListProps
  extends Omit<
    BaseSettingsDialogProps,
    'searchBuffer' | 'items' | 'maxLabelWidth'
  > {
  /** All available items */
  items: SettingsDialogItem[];
  /** Optional custom search query handler */
  onSearch?: (query: string) => void;
  /** Initial search query */
  initialSearchQuery?: string;
}

/**
 * A generic searchable list component that wraps BaseSettingsDialog.
 * It handles fuzzy searching and filtering of items.
 */
export function SearchableList({
  items,
  onSearch,
  initialSearchQuery = '',
  ...baseProps
}: SearchableListProps): React.JSX.Element {
  // Search state
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
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

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    doSearch();

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
  const displayItems = useMemo(() => {
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

  return (
    <BaseSettingsDialog
      {...baseProps}
      items={displayItems}
      searchBuffer={searchBuffer}
      maxLabelWidth={maxLabelWidth}
    />
  );
}
