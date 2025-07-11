/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Text, Box, useInput } from 'ink';
import { Colors } from '../../colors.js';

export interface RadioSelectItem<T> {
  label: string;
  value: T;
  disabled?: boolean;
  themeNameDisplay?: string;
  themeTypeDisplay?: string;
}

export interface RadioButtonSelectProps<T> {
  items: Array<RadioSelectItem<T>>;
  initialIndex?: number;
  onSelect: (value: T) => void;
  onHighlight?: (value: T) => void;
  isFocused?: boolean;
  showScrollArrows?: boolean;
  maxItemsToShow?: number;
}

export function RadioButtonSelect<T>({
  items,
  initialIndex = 0,
  onSelect,
  onHighlight,
  isFocused,
  showScrollArrows = true,
  maxItemsToShow = 10,
}: RadioButtonSelectProps<T>): React.JSX.Element {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [scrollOffset, setScrollOffset] = useState(0);

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

  useInput(
    (input, key) => {
      if (key.upArrow) {
        const newIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
        setActiveIndex(newIndex);
        onHighlight?.(items[newIndex]!.value);
      }
      if (key.downArrow) {
        const newIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
        setActiveIndex(newIndex);
        onHighlight?.(items[newIndex]!.value);
      }
      if (key.return) {
        onSelect(items[activeIndex]!.value);
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
        if (isSelected) {
          textColor = Colors.AccentGreen;
        } else if (item.disabled) {
          textColor = Colors.Gray;
        }

        return (
          <Box key={item.label}>
            <Box minWidth={2} flexShrink={0}>
              <Text color={isSelected ? Colors.AccentGreen : Colors.Foreground}>
                {isSelected ? '●' : '○'}
              </Text>
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
