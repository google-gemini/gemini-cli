/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { useKeypress } from './useKeypress.js';

export interface SelectionListItem<T> {
  value: T;
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

const NUMBER_INPUT_TIMEOUT_MS = 1000;

/**
 * Helper function to find the next enabled index in a given direction, supporting wrapping.
 */
const findNextValidIndex = <T>(
  currentIndex: number,
  direction: 'up' | 'down',
  items: Array<SelectionListItem<T>>,
): number => {
  const len = items.length;
  if (len === 0) return currentIndex;

  let nextIndex = currentIndex;
  const step = direction === 'down' ? 1 : -1;

  // Iterate through the list (at most once) until an enabled item is found
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
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const numberInputRef = useRef('');
  const numberInputTimer = useRef<NodeJS.Timeout | null>(null);

  // Synchronize internal state when initialIndex or items change.
  // Crucially, this ensures the active index is valid (enabled) if possible.
  useEffect(() => {
    let targetIndex = initialIndex;

    if (items.length === 0) {
      // Reset if the list is empty
      setActiveIndex(0);
      return;
    }

    // Ensure targetIndex is within bounds; default to 0 if out of bounds.
    if (targetIndex < 0 || targetIndex >= items.length) {
      targetIndex = 0;
    }

    // Check if the target index is disabled.
    if (items[targetIndex]?.disabled) {
      const nextValid = findNextValidIndex(targetIndex, 'down', items);

      if (nextValid !== targetIndex) {
        setActiveIndex(nextValid);
        return;
      }
    }

    // We only call setActiveIndex if the value is actually different to avoid unnecessary re-renders.
    if (targetIndex !== activeIndex) {
      setActiveIndex(targetIndex);
    }

    // We depend on the 'items' array reference itself to detect changes in the list structure or disabled status.
    // We also depend on initialIndex to sync external changes.
    // We explicitly exclude activeIndex from the dependency array to prevent loops, as this effect sets activeIndex.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIndex, items]);

  useEffect(
    () => () => {
      if (numberInputTimer.current) {
        clearTimeout(numberInputTimer.current);
      }
    },
    [],
  );

  useKeypress(
    (key) => {
      const { sequence, name } = key;
      const isNumeric = showNumbers && /^[0-9]$/.test(sequence);

      // Clear number input buffer on non-numeric key press
      if (!isNumeric && numberInputTimer.current) {
        clearTimeout(numberInputTimer.current);
        numberInputRef.current = '';
      }

      if (name === 'k' || name === 'up') {
        const newIndex = findNextValidIndex(activeIndex, 'up', items);
        if (newIndex !== activeIndex) {
          setActiveIndex(newIndex);
          onHighlight?.(items[newIndex]!.value);
        }
        return;
      }

      if (name === 'j' || name === 'down') {
        const newIndex = findNextValidIndex(activeIndex, 'down', items);
        if (newIndex !== activeIndex) {
          setActiveIndex(newIndex);
          onHighlight?.(items[newIndex]!.value);
        }
        return;
      }

      if (name === 'return') {
        const currentItem = items[activeIndex];
        if (currentItem && !currentItem.disabled) {
          onSelect(currentItem.value);
        }
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

        if (targetIndex >= 0 && targetIndex < items.length) {
          const targetItem = items[targetIndex]!;
          setActiveIndex(targetIndex);
          onHighlight?.(targetItem.value);

          // If the number can't be a prefix for another valid number, select immediately
          const potentialNextNumber = Number.parseInt(newNumberInput + '0', 10);
          if (potentialNextNumber > items.length) {
            if (!targetItem.disabled) {
              onSelect(targetItem.value);
            }
            numberInputRef.current = '';
          } else {
            // Otherwise wait for more input or timeout
            numberInputTimer.current = setTimeout(() => {
              if (!targetItem.disabled) {
                onSelect(targetItem.value);
              }
              numberInputRef.current = '';
            }, NUMBER_INPUT_TIMEOUT_MS);
          }
        } else {
          // Number is out of bounds
          numberInputRef.current = '';
        }
      }
    },
    { isActive: !!(isFocused && items.length > 0) },
  );

  return {
    activeIndex,
    setActiveIndex,
  };
}
