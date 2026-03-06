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
  scrollOffset: number;
};

type NavAction =
  | { type: 'MOVE_UP' }
  | { type: 'MOVE_DOWN' }
  | { type: 'JUMP_TO'; index: number };

function clampScroll(
  offset: number,
  activeIndex: number,
  itemCount: number,
  maxItemsToShow: number,
): number {
  if (activeIndex < offset) {
    offset = activeIndex;
  } else if (activeIndex >= offset + maxItemsToShow) {
    offset = activeIndex - maxItemsToShow + 1;
  }
  return Math.max(0, Math.min(offset, Math.max(0, itemCount - maxItemsToShow)));
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
          scrollOffset: clampScroll(
            state.scrollOffset,
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
          scrollOffset: clampScroll(
            state.scrollOffset,
            newIndex,
            items.length,
            maxItemsToShow,
          ),
        };
      }
      case 'JUMP_TO': {
        const newIndex = Math.max(0, Math.min(action.index, items.length - 1));
        return {
          activeItemKey: items[newIndex].key,
          scrollOffset: clampScroll(
            state.scrollOffset,
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
    scrollOffset: 0,
  });

  const activeIndex = useMemo(() => {
    if (items.length === 0) return 0;
    const idx = items.findIndex((i) => i.key === state.activeItemKey);
    return idx !== -1 ? idx : 0;
  }, [items, state.activeItemKey]);

  const scrollOffset = useMemo(
    () =>
      clampScroll(
        state.scrollOffset,
        activeIndex,
        items.length,
        maxItemsToShow,
      ),
    [state.scrollOffset, activeIndex, items.length, maxItemsToShow],
  );

  const moveUp = useCallback(() => dispatch({ type: 'MOVE_UP' }), []);
  const moveDown = useCallback(() => dispatch({ type: 'MOVE_DOWN' }), []);
  const jumpTo = useCallback(
    (index: number) => dispatch({ type: 'JUMP_TO', index }),
    [],
  );

  return {
    activeItemKey: state.activeItemKey,
    activeIndex,
    scrollOffset,
    moveUp,
    moveDown,
    jumpTo,
  };
}
