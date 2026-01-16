/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ScrollableList,
  type ScrollableListRef,
} from './ScrollableList.js';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { keyMatchers, Command } from '../../keyMatchers.js';

interface SelectableListProps<T> {
  data: T[];
  renderItem: (info: { item: T; index: number; isSelected: boolean }) => React.ReactElement;
  estimatedItemHeight: (index: number) => number;
  keyExtractor: (item: T, index: number) => string;
  onSelect: (item: T) => void;
  onBack?: () => void;
  hasFocus?: boolean;
}

export function SelectableList<T>({
  data,
  renderItem,
  estimatedItemHeight,
  keyExtractor,
  onSelect,
  onBack,
  hasFocus = true,
}: SelectableListProps<T>) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<ScrollableListRef<T>>(null);

  // Ensure selectedIndex is valid when data changes
  useEffect(() => {
    if (selectedIndex >= data.length) {
      setSelectedIndex(Math.max(0, data.length - 1));
    }
  }, [data.length, selectedIndex]);

  // Scroll to selected item when it changes
  useEffect(() => {
    if (listRef.current) {
      // We use scrollToIndex to ensure the selected item is visible
      // logic is handled by VirtualizedList to scroll only if out of view
      listRef.current.scrollToIndex({ index: selectedIndex });
    }
  }, [selectedIndex]);

  useKeypress(
    (key: Key) => {
      if (keyMatchers[Command.SCROLL_UP](key)) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (keyMatchers[Command.SCROLL_DOWN](key)) {
        setSelectedIndex((prev) => Math.min(data.length - 1, prev + 1));
      } else if (keyMatchers[Command.SCROLL_HOME](key)) {
        setSelectedIndex(0);
      } else if (keyMatchers[Command.SCROLL_END](key)) {
        setSelectedIndex(data.length - 1);
      } else if (key.name === 'return') {
        if (data[selectedIndex]) {
          onSelect(data[selectedIndex]);
        }
      } else if (key.name === 'escape' && onBack) {
        onBack();
      } else if (
        keyMatchers[Command.PAGE_UP](key) ||
        keyMatchers[Command.PAGE_DOWN](key)
      ) {
         // Pass page up/down to the list for scrolling, but we might want to update selection too?
         // For now, let's just update selection by a page amount?
         // Or just scroll. But if we just scroll, selection might go out of view.
         // Let's keep it simple: Page Up/Down moves selection by 5 items (arbitrary) or just ignore for now to keep implementation simple.
         // Better: forward to listRef but update selectedIndex to be visible?
         // This is complex because we don't know exactly which item becomes visible.
         // Let's implement simple page jump of 5 items.
         const jump = 5;
         const direction = keyMatchers[Command.PAGE_UP](key) ? -1 : 1;
         setSelectedIndex(prev => Math.max(0, Math.min(data.length - 1, prev + direction * jump)));
      }
    },
    { isActive: hasFocus },
  );

  const renderWrappedItem = useCallback(
    ({ item, index }: { item: T; index: number }) => {
      return renderItem({ item, index, isSelected: index === selectedIndex });
    },
    [renderItem, selectedIndex],
  );

  return (
    <ScrollableList
      ref={listRef}
      data={data}
      renderItem={renderWrappedItem}
      estimatedItemHeight={estimatedItemHeight}
      keyExtractor={keyExtractor}
      hasFocus={false} // We handle keys
    />
  );
}