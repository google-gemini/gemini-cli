/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useRef, useCallback } from 'react';

export interface UseSettingsNavigationProps {
  /** All items available in the list */
  items: Array<{ key: string }>;
  /** Maximum number of items visible at once */
  maxItemsToShow: number;
}

/**
 * Hook to manage navigation and scroll state for a list of items.
 */
export function useSettingsNavigation({
  items,
  maxItemsToShow,
}: UseSettingsNavigationProps) {
  const [activeItemKey, setActiveItemKey] = useState<string | null>(
    () => items[0]?.key ?? null,
  );
  const prevScrollRef = useRef(0);

  const activeIndex = useMemo(() => {
    if (items.length === 0) return 0;
    const idx = items.findIndex((i) => i.key === activeItemKey);
    return idx !== -1 ? idx : 0;
  }, [items, activeItemKey]);

  const scrollOffset = useMemo(() => {
    if (items.length === 0) return 0;
    let offset = prevScrollRef.current;
    if (activeIndex < offset) {
      offset = activeIndex;
    } else if (activeIndex >= offset + maxItemsToShow) {
      offset = activeIndex - maxItemsToShow + 1;
    }
    const maxScroll = Math.max(0, items.length - maxItemsToShow);
    offset = Math.max(0, Math.min(offset, maxScroll));
    prevScrollRef.current = offset;
    return offset;
  }, [activeIndex, items.length, maxItemsToShow]);

  const moveUp = useCallback(() => {
    if (items.length === 0) return;
    const newIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
    setActiveItemKey(items[newIndex]?.key ?? null);
  }, [activeIndex, items]);

  const moveDown = useCallback(() => {
    if (items.length === 0) return;
    const newIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
    setActiveItemKey(items[newIndex]?.key ?? null);
  }, [activeIndex, items]);

  const jumpTo = useCallback(
    (index: number) => {
      if (items.length === 0) return;
      const safeIndex = Math.max(0, Math.min(index, items.length - 1));
      setActiveItemKey(items[safeIndex]?.key ?? null);
    },
    [items],
  );

  return {
    activeItemKey,
    setActiveItemKey,
    activeIndex,
    scrollOffset,
    moveUp,
    moveDown,
    jumpTo,
  };
}
