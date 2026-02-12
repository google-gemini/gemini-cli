/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { TextInput } from './TextInput.js';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { keyMatchers, Command } from '../../keyMatchers.js';
import {
  useFuzzyList,
  type GenericListItem,
} from '../../hooks/useFuzzyList.js';

export interface SearchableListProps<T extends GenericListItem> {
  /** List title */
  title?: string;
  /** Available items */
  items: T[];
  /** Callback when an item is selected */
  onSelect: (item: T) => void;
  /** Callback when the list is closed (e.g. via Esc) */
  onClose?: () => void;
  /** Initial search query */
  initialSearchQuery?: string;
  /** Placeholder for search input */
  searchPlaceholder?: string;
  /** Max items to show at once */
  maxItemsToShow?: number;
}

/**
 * A generic searchable list component.
 */
export function SearchableList<T extends GenericListItem>({
  title,
  items,
  onSelect,
  onClose,
  initialSearchQuery = '',
  searchPlaceholder = 'Search...',
  maxItemsToShow = 10,
}: SearchableListProps<T>): React.JSX.Element {
  const { filteredItems, searchBuffer, maxLabelWidth } = useFuzzyList({
    items,
    initialQuery: initialSearchQuery,
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Reset selection when filtered items change
  useEffect(() => {
    setActiveIndex(0);
    setScrollOffset(0);
  }, [filteredItems]);

  // Calculate visible items
  const visibleItems = filteredItems.slice(
    scrollOffset,
    scrollOffset + maxItemsToShow,
  );
  const showScrollUp = scrollOffset > 0;
  const showScrollDown = scrollOffset + maxItemsToShow < filteredItems.length;

  useKeypress(
    (key: Key) => {
      // Navigation
      if (keyMatchers[Command.DIALOG_NAVIGATION_UP](key)) {
        const newIndex =
          activeIndex > 0 ? activeIndex - 1 : filteredItems.length - 1;
        setActiveIndex(newIndex);
        if (newIndex === filteredItems.length - 1) {
          setScrollOffset(Math.max(0, filteredItems.length - maxItemsToShow));
        } else if (newIndex < scrollOffset) {
          setScrollOffset(newIndex);
        }
        return;
      }
      if (keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key)) {
        const newIndex =
          activeIndex < filteredItems.length - 1 ? activeIndex + 1 : 0;
        setActiveIndex(newIndex);
        if (newIndex === 0) {
          setScrollOffset(0);
        } else if (newIndex >= scrollOffset + maxItemsToShow) {
          setScrollOffset(newIndex - maxItemsToShow + 1);
        }
        return;
      }

      // Selection
      if (keyMatchers[Command.RETURN](key)) {
        const item = filteredItems[activeIndex];
        if (item) {
          onSelect(item);
        }
        return;
      }

      // Close
      if (keyMatchers[Command.ESCAPE](key)) {
        onClose?.();
        return;
      }
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      {/* Header */}
      {title && (
        <Box marginBottom={1}>
          <Text bold>{title}</Text>
        </Box>
      )}

      {/* Search Input */}
      {searchBuffer && (
        <Box
          borderStyle="round"
          borderColor={theme.border.focused}
          paddingX={1}
          marginBottom={1}
        >
          <TextInput
            buffer={searchBuffer}
            placeholder={searchPlaceholder}
            focus={true}
          />
        </Box>
      )}

      {/* List */}
      <Box flexDirection="column">
        {visibleItems.length === 0 ? (
          <Text color={theme.text.secondary}>No items found.</Text>
        ) : (
          visibleItems.map((item, idx) => {
            const index = scrollOffset + idx;
            const isActive = index === activeIndex;

            return (
              <Box key={item.key} flexDirection="row">
                <Text
                  color={isActive ? theme.status.success : theme.text.secondary}
                >
                  {isActive ? '> ' : '  '}
                </Text>
                <Box width={maxLabelWidth + 2}>
                  <Text
                    color={isActive ? theme.status.success : theme.text.primary}
                  >
                    {item.label}
                  </Text>
                </Box>
                {item.description && (
                  <Text color={theme.text.secondary}>{item.description}</Text>
                )}
              </Box>
            );
          })
        )}
      </Box>

      {/* Footer/Scroll Indicators */}
      {(showScrollUp || showScrollDown) && (
        <Box marginTop={1} justifyContent="center">
          <Text color={theme.text.secondary}>
            {showScrollUp ? '▲ ' : '  '}
            {filteredItems.length} items
            {showScrollDown ? ' ▼' : '  '}
          </Text>
        </Box>
      )}
    </Box>
  );
}
