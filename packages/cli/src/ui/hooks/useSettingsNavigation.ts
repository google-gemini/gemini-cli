/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useReducer, useCallback } from 'react';

export interface UseSettingsNavigationProps {
  items: Array<{ key: string }>;
  maxItemsToShow: number;
}

type NavState = {
  activeItemKey: string | null;
  windowStart: number;
};

type NavAction = { type: 'MOVE_UP' } | { type: 'MOVE_DOWN' };

function calculateSlidingWindow(
  start: number,
  activeIndex: number,
  itemCount: number,
  windowSize: number,
): number {
  // User moves up above the window start
  if (activeIndex < start) {
    start = activeIndex;
    // User moves down below the window end
  } else if (activeIndex >= start + windowSize) {
    start = activeIndex - windowSize + 1;
  }
  // User is inside the window but performed search or terminal resized
  const maxScroll = Math.max(0, itemCount - windowSize);
  const bounded = Math.min(start, maxScroll);
  return Math.max(0, bounded);
}

function createNavReducer(
  items: Array<{ key: string }>,
  maxItemsToShow: number,
) {
  return function navReducer(state: NavState, action: NavAction): NavState {
    if (items.length === 0) return state;

    const currentIndex = items.findIndex((i) => i.key === state.activeItemKey);
    const activeIndex = currentIndex !== -1 ? currentIndex : 0;

    switch (action.type) {
      case 'MOVE_UP': {
        const newIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
        return {
          activeItemKey: items[newIndex].key,
          windowStart: calculateSlidingWindow(
            state.windowStart,
            newIndex,
            items.length,
            maxItemsToShow,
          ),
        };
      }
      case 'MOVE_DOWN': {
        const newIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
        return {
          activeItemKey: items[newIndex].key,
          windowStart: calculateSlidingWindow(
            state.windowStart,
            newIndex,
            items.length,
            maxItemsToShow,
          ),
        };
      }
      default: {
        return state;
      }
    }
  };
}

export function useSettingsNavigation({
  items,
  maxItemsToShow,
}: UseSettingsNavigationProps) {
  const reducer = useMemo(
    () => createNavReducer(items, maxItemsToShow),
    [items, maxItemsToShow],
  );

  const [state, dispatch] = useReducer(reducer, {
    activeItemKey: items[0]?.key ?? null,
    windowStart: 0,
  });

  // Retain the proper highlighting when items change (e.g. search)
  const activeIndex = useMemo(() => {
    if (items.length === 0) return 0;
    const idx = items.findIndex((i) => i.key === state.activeItemKey);
    return idx !== -1 ? idx : 0;
  }, [items, state.activeItemKey]);

  const windowStart = useMemo(
    () =>
      calculateSlidingWindow(
        state.windowStart,
        activeIndex,
        items.length,
        maxItemsToShow,
      ),
    [state.windowStart, activeIndex, items.length, maxItemsToShow],
  );

  const moveUp = useCallback(() => dispatch({ type: 'MOVE_UP' }), []);
  const moveDown = useCallback(() => dispatch({ type: 'MOVE_DOWN' }), []);

  return {
    activeItemKey: state.activeItemKey,
    activeIndex,
    windowStart,
    moveUp,
    moveDown,
  };
}
