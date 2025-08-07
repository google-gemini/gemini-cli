/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { Text, Box, useInput } from 'ink';
import { Colors } from '../../colors.js';

/**
 * Represents a single option for the RadioButtonSelect.
 * Requires a label for display and a value to be returned on selection.
 */
export interface RadioSelectItem<T> {
  label: string;
  value: T;
  disabled?: boolean;
  themeNameDisplay?: string;
  themeTypeDisplay?: string;
}

/**
 * Props for the RadioButtonSelect component.
 * @template T The type of the value associated with each radio item.
 */
export interface RadioButtonSelectProps<T> {
  /** An array of items to display as radio options. */
  items: Array<RadioSelectItem<T>>;
  /** The initial index selected */
  initialIndex?: number;
  /** Function called when an item is selected. Receives the `value` of the selected item. */
  onSelect: (value: T) => void;
  /** Function called when an item is highlighted. Receives the `value` of the selected item. */
  onHighlight?: (value: T) => void;
  /** Whether this select input is currently focused and should respond to input. */
  isFocused?: boolean;
  /** Whether to show the scroll arrows. */
  showScrollArrows?: boolean;
  /** The maximum number of items to show at once. */
  maxItemsToShow?: number;
  /** Whether to show numbers next to items. */
  showNumbers?: boolean;
}

/**
 * A custom component that displays a list of items with radio buttons,
 * supporting scrolling and keyboard navigation.
 *
 * @template T The type of the value associated with each radio item.
 */
export function RadioButtonSelect<T>({
  items,
  initialIndex = 0,
  onSelect,
  onHighlight,
  isFocused,
  showScrollArrows = false,
  maxItemsToShow = 10,
  showNumbers = true,
}: RadioButtonSelectProps<T>): React.JSX.Element {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [numberInput, setNumberInput] = useState('');
  const numberInputTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const newScrollOffset = Math.max(
      0,
      Math.min(activeIndex - maxItemsToShow + 1, items.length - maxItemsToShow),
    );
    if (activeIndex < scrollOffset) {
      setScrollOffset(activeIndex);
    } else if (activeIndex >= scrollOffset + maxItemsToShow) {
      setScrollOffset(newScrollOffset);
    }
  }, [activeIndex, items.length, scrollOffset, maxItemsToShow]);

  useEffect(
    () => () => {
      if (numberInputTimer.current) {
        clearTimeout(numberInputTimer.current);
      }
    },
    [],
  );

  useInput(
    (input, key) => {
      const isNumeric = showNumbers && /^[0-9]$/.test(input);

      // Any key press that is not a digit should clear the number input buffer.
      if (!isNumeric && numberInputTimer.current) {
        clearTimeout(numberInputTimer.current);
        setNumberInput('');
      }

      if (input === 'k' || key.upArrow) {
        const newIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
        setActiveIndex(newIndex);
        onHighlight?.(items[newIndex]!.value);
        return;
      }

      if (input === 'j' || key.downArrow) {
        const newIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
        setActiveIndex(newIndex);
        onHighlight?.(items[newIndex]!.value);
        return;
      }

      if (key.return) {
        onSelect(items[activeIndex]!.value);
        return;
      }

      // Handle numeric input for selection.
      if (isNumeric) {
        if (numberInputTimer.current) {
          clearTimeout(numberInputTimer.current);
        }

        const newNumberInput = numberInput + input;
        setNumberInput(newNumberInput);

        const targetIndex = Number.parseInt(newNumberInput, 10) - 1;

        // A single '0' is not a valid selection since items are 1-indexed.
        if (newNumberInput === '0') {
          numberInputTimer.current = setTimeout(() => setNumberInput(''), 350);
          return;
        }

        if (targetIndex >= 0 && targetIndex < items.length) {
          const targetItem = items[targetIndex]!;
          setActiveIndex(targetIndex);
          onHighlight?.(targetItem.value);

          // If the typed number can't be a prefix for another valid number,
          // select it immediately. Otherwise, wait for more input.
          const potentialNextNumber = Number.parseInt(newNumberInput + '0', 10);
          if (potentialNextNumber > items.length) {
            onSelect(targetItem.value);
            setNumberInput('');
          } else {
            numberInputTimer.current = setTimeout(() => {
              onSelect(targetItem.value);
              setNumberInput('');
            }, 350); // Debounce time for multi-digit input.
          }
        } else {
          // The typed number is out of bounds, clear the buffer
          setNumberInput('');
        }
      }
    },
    { isActive: isFocused && items.length > 0 },
  );

  const visibleItems = items.slice(scrollOffset, scrollOffset + maxItemsToShow);

  return (
    <Box flexDirection="column">
      {showScrollArrows && (
        <Text color={scrollOffset > 0 ? Colors.Foreground : Colors.Gray}>
          ▲
        </Text>
      )}
      {visibleItems.map((item, index) => {
        const itemIndex = scrollOffset + index;
        const isSelected = activeIndex === itemIndex;

        let textColor = Colors.Foreground;
        let numberColor = Colors.Foreground;
        if (isSelected) {
          textColor = Colors.AccentGreen;
          numberColor = Colors.AccentGreen;
        } else if (item.disabled) {
          textColor = Colors.Gray;
          numberColor = Colors.Gray;
        }

        if (!showNumbers) {
          numberColor = Colors.Gray;
        }

        const numberColumnWidth = String(items.length).length;
        const itemNumberText = `${String(itemIndex + 1).padStart(
          numberColumnWidth,
        )}.`;

        return (
          <Box key={item.label} alignItems="center">
            <Box minWidth={2} flexShrink={0}>
              <Text color={isSelected ? Colors.AccentGreen : Colors.Foreground}>
                {isSelected ? '●' : ' '}
              </Text>
            </Box>
            <Box
              marginRight={1}
              flexShrink={0}
              minWidth={itemNumberText.length}
            >
              <Text color={numberColor}>{itemNumberText}</Text>
            </Box>
            {item.themeNameDisplay && item.themeTypeDisplay ? (
              <Text color={textColor} wrap="truncate">
                {item.themeNameDisplay}{' '}
                <Text color={Colors.Gray}>{item.themeTypeDisplay}</Text>
              </Text>
            ) : (
              <Text color={textColor} wrap="truncate">
                {item.label}
              </Text>
            )}
          </Box>
        );
      })}
      {showScrollArrows && (
        <Text
          color={
            scrollOffset + maxItemsToShow < items.length
              ? Colors.Foreground
              : Colors.Gray
          }
        >
          ▼
        </Text>
      )}
    </Box>
  );
}
