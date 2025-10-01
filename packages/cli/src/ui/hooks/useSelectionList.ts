/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useReducer, useRef, useEffect, useCallback } from 'react';
import { useKeypress, type Key } from './useKeypress.js';

export interface SelectionListItem<T> {
  key: string;
  value: T;
  disabled?: boolean;
}

interface BaseSelectionItem {
  key: string;
  disabled?: boolean;
}

export interface UseSelectionListOptions<T> {
  items: Array<SelectionListItem<T>>;
  initialIndex?: number;
  onSelect: (value: T) => void;
  onHighlight?: (value: T) => void;
  isFocused?: boolean;
  showNumbers?: boolean;
}

export interface UseSelectionListResult {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
}

interface SelectionListState {
  activeIndex: number;
  initialIndex: number;
  pendingHighlight: boolean;
  pendingSelect: boolean;
  items: BaseSelectionItem[];
}

type SelectionListAction =
  | {
      type: 'SET_ACTIVE_INDEX';
      payload: {
        index: number;
      };
    }
  | {
      type: 'MOVE_UP';
    }
  | {
      type: 'MOVE_DOWN';
    }
  | {
      type: 'SELECT_CURRENT';
    }
  | {
      type: 'INITIALIZE';
      payload: { initialIndex: number; items: BaseSelectionItem[] };
    }
  | {
      type: 'CLEAR_PENDING_FLAGS';
    };

const NUMBER_INPUT_TIMEOUT_MS = 1000;

/**
 * Helper function to find the next enabled index in a given direction, supporting wrapping.
 */
const findNextValidIndex = (
  currentIndex: number,
  direction: 'up' | 'down',
  items: BaseSelectionItem[],
): number => {
  const len = items.length;
  if (len === 0) return currentIndex;

  let nextIndex = currentIndex;
  const step = direction === 'down' ? 1 : -1;

  for (let i = 0; i < len; i++) {
    // Calculate the next index, wrapping around if necessary.
    // We add `len` before the modulo to ensure a positive result in JS for negative steps.
    nextIndex = (nextIndex + step + len) % len;

    if (!items[nextIndex]?.disabled) {
      return nextIndex;
    }
  }

  // If all items are disabled, return the original index
  return currentIndex;
};

const computeInitialIndex = (
  initialIndex: number,
  items: BaseSelectionItem[],
  initialKey?: string,
): number => {
  if (items.length === 0) {
    return 0;
  }

  if (initialKey !== undefined) {
    for (let i = 0; i < items.length; i++) {
      if (items[i]!.key === initialKey && !items[i]!.disabled) {
        return i;
      }
    }
  }

  let targetIndex = initialIndex;

  if (targetIndex < 0 || targetIndex >= items.length) {
    targetIndex = 0;
  }

  if (items[targetIndex]?.disabled) {
    const nextValid = findNextValidIndex(targetIndex, 'down', items);
    targetIndex = nextValid;
  }

  return targetIndex;
};

function selectionListReducer(
  state: SelectionListState,
  action: SelectionListAction,
): SelectionListState {
  switch (action.type) {
    case 'SET_ACTIVE_INDEX': {
      const { index } = action.payload;
      const { items } = state;

      // Only update if index actually changed and is valid
      if (index === state.activeIndex) {
        return state;
      }

      if (index >= 0 && index < items.length) {
        return { ...state, activeIndex: index, pendingHighlight: true };
      }
      return state;
    }

    case 'MOVE_UP': {
      const { items } = state;
      const newIndex = findNextValidIndex(state.activeIndex, 'up', items);
      if (newIndex !== state.activeIndex) {
        return { ...state, activeIndex: newIndex, pendingHighlight: true };
      }
      return state;
    }

    case 'MOVE_DOWN': {
      const { items } = state;
      const newIndex = findNextValidIndex(state.activeIndex, 'down', items);
      if (newIndex !== state.activeIndex) {
        return { ...state, activeIndex: newIndex, pendingHighlight: true };
      }
      return state;
    }

    case 'SELECT_CURRENT': {
      return { ...state, pendingSelect: true };
    }

    case 'INITIALIZE': {
      const { initialIndex, items } = action.payload;
      const activeKey =
        initialIndex === state.initialIndex &&
        state.activeIndex !== state.initialIndex
          ? state.items[state.activeIndex]?.key
          : undefined;

      // We don't need to check for equality here anymore as it is handled in the effect
      const targetIndex = computeInitialIndex(initialIndex, items, activeKey);

      return {
        ...state,
        items,
        initialIndex,
        activeIndex: targetIndex,
        pendingHighlight: false,
      };
    }

    case 'CLEAR_PENDING_FLAGS': {
      return {
        ...state,
        pendingHighlight: false,
        pendingSelect: false,
      };
    }

    default: {
      const exhaustiveCheck: never = action;
      console.error(`Unknown selection list action: ${exhaustiveCheck}`);
      return state;
    }
  }
}

function areBaseItemsEqual(
  a: BaseSelectionItem[],
  b: BaseSelectionItem[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (a[i]!.key !== b[i]!.key || a[i]!.disabled !== b[i]!.disabled) {
      return false;
    }
  }

  return true;
}

function toBaseItems<T>(
  items: Array<SelectionListItem<T>>,
): BaseSelectionItem[] {
  return items.map(({ key, disabled }) => ({ key, disabled }));
}

/**
 * A headless hook that provides keyboard navigation and selection logic
 * for list-based selection components like radio buttons and menus.
 *
 * Features:
 * - Keyboard navigation with j/k and arrow keys
 * - Selection with Enter key
 * - Numeric quick selection (when showNumbers is true)
 * - Handles disabled items (skips them during navigation)
 * - Wrapping navigation (last to first, first to last)
 */
export function useSelectionList<T>({
  items,
  initialIndex = 0,
  onSelect,
  onHighlight,
  isFocused = true,
  showNumbers = false,
}: UseSelectionListOptions<T>): UseSelectionListResult {
  const baseItems = toBaseItems(items);

  const [state, dispatch] = useReducer(selectionListReducer, {
    activeIndex: computeInitialIndex(initialIndex, baseItems),
    initialIndex,
    pendingHighlight: false,
    pendingSelect: false,
    items: baseItems,
  });
  const numberInputRef = useRef('');
  const numberInputTimer = useRef<NodeJS.Timeout | null>(null);

  const prevBaseItemsRef = useRef(baseItems);
  const prevInitialIndexRef = useRef(initialIndex);

  // Initialize/synchronize state when initialIndex or items change
  useEffect(() => {
    const baseItemsChanged = !areBaseItemsEqual(
      prevBaseItemsRef.current,
      baseItems,
    );
    const initialIndexChanged = prevInitialIndexRef.current !== initialIndex;

    if (baseItemsChanged || initialIndexChanged) {
      dispatch({
        type: 'INITIALIZE',
        payload: { initialIndex, items: baseItems },
      });
      prevBaseItemsRef.current = baseItems;
      prevInitialIndexRef.current = initialIndex;
    }
  });

  // Handle side effects based on state changes
  useEffect(() => {
    let needsClear = false;

    if (state.pendingHighlight && items[state.activeIndex]) {
      onHighlight?.(items[state.activeIndex]!.value);
      needsClear = true;
    }

    if (state.pendingSelect && items[state.activeIndex]) {
      const currentItem = items[state.activeIndex];
      if (currentItem && !currentItem.disabled) {
        onSelect(currentItem.value);
      }
      needsClear = true;
    }

    if (needsClear) {
      dispatch({ type: 'CLEAR_PENDING_FLAGS' });
    }
  }, [
    state.pendingHighlight,
    state.pendingSelect,
    state.activeIndex,
    items,
    onHighlight,
    onSelect,
  ]);

  useEffect(
    () => () => {
      if (numberInputTimer.current) {
        clearTimeout(numberInputTimer.current);
      }
    },
    [],
  );

  const itemsLength = items.length;
  const handleKeypress = useCallback(
    (key: Key) => {
      const { sequence, name } = key;
      const isNumeric = showNumbers && /^[0-9]$/.test(sequence);

      // Clear number input buffer on non-numeric key press
      if (!isNumeric && numberInputTimer.current) {
        clearTimeout(numberInputTimer.current);
        numberInputRef.current = '';
      }

      if (name === 'k' || name === 'up') {
        dispatch({ type: 'MOVE_UP' });
        return;
      }

      if (name === 'j' || name === 'down') {
        dispatch({ type: 'MOVE_DOWN' });
        return;
      }

      if (name === 'return') {
        dispatch({ type: 'SELECT_CURRENT' });
        return;
      }

      // Handle numeric input for quick selection
      if (isNumeric) {
        if (numberInputTimer.current) {
          clearTimeout(numberInputTimer.current);
        }

        const newNumberInput = numberInputRef.current + sequence;
        numberInputRef.current = newNumberInput;

        const targetIndex = Number.parseInt(newNumberInput, 10) - 1;

        // Single '0' is invalid (1-indexed)
        if (newNumberInput === '0') {
          numberInputTimer.current = setTimeout(() => {
            numberInputRef.current = '';
          }, NUMBER_INPUT_TIMEOUT_MS);
          return;
        }

        if (targetIndex >= 0 && targetIndex < itemsLength) {
          dispatch({
            type: 'SET_ACTIVE_INDEX',
            payload: { index: targetIndex },
          });

          // If the number can't be a prefix for another valid number, select immediately
          const potentialNextNumber = Number.parseInt(newNumberInput + '0', 10);
          if (potentialNextNumber > itemsLength) {
            dispatch({
              type: 'SELECT_CURRENT',
            });
            numberInputRef.current = '';
          } else {
            // Otherwise wait for more input or timeout
            numberInputTimer.current = setTimeout(() => {
              dispatch({
                type: 'SELECT_CURRENT',
              });
              numberInputRef.current = '';
            }, NUMBER_INPUT_TIMEOUT_MS);
          }
        } else {
          // Number is out of bounds
          numberInputRef.current = '';
        }
      }
    },
    [dispatch, itemsLength, showNumbers],
  );

  useKeypress(handleKeypress, { isActive: !!(isFocused && itemsLength > 0) });

  const setActiveIndex = (index: number) => {
    dispatch({
      type: 'SET_ACTIVE_INDEX',
      payload: { index },
    });
  };

  return {
    activeIndex: state.activeIndex,
    setActiveIndex,
  };
}
