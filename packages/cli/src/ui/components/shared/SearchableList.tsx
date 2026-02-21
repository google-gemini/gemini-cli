/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useCallback } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { useSelectionList } from '../../hooks/useSelectionList.js';
import { TextInput } from './TextInput.js';
import type { TextBuffer } from './text-buffer.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { keyMatchers, Command } from '../../keyMatchers.js';

/**
 * Generic interface for items in a searchable list.
 */
export interface GenericListItem {
  key: string;
  label: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * State returned by the search hook.
 */
export interface SearchListState<T extends GenericListItem> {
  filteredItems: T[];
  searchBuffer: TextBuffer | undefined;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  maxLabelWidth: number;
}

/**
 * Props for the SearchableList component.
 */
export interface SearchableListProps<T extends GenericListItem> {
  title?: string;
  items: T[];
  onSelect: (item: T) => void;
  onClose: () => void;
  searchPlaceholder?: string;
  /** Custom item renderer */
  renderItem?: (
    item: T,
    isActive: boolean,
    labelWidth: number,
  ) => React.ReactNode;
  /** Optional header content */
  header?: React.ReactNode;
  /** Optional footer content */
  footer?: (info: {
    startIndex: number;
    endIndex: number;
    totalVisible: number;
  }) => React.ReactNode;
  maxItemsToShow?: number;
  /** Hook to handle search logic */
  useSearch: (props: {
    items: T[];
    onSearch?: (query: string) => void;
  }) => SearchListState<T>;
  onSearch?: (query: string) => void;
  /** Whether to reset selection to the top when items change (e.g. after search) */
  resetSelectionOnItemsChange?: boolean;
}

/**
 * A generic searchable list component with keyboard navigation.
 */
export function SearchableList<T extends GenericListItem>({
  title,
  items,
  onSelect,
  onClose,
  searchPlaceholder = 'Search...',
  renderItem,
  header,
  footer,
  maxItemsToShow = 10,
  useSearch,
  onSearch,
  resetSelectionOnItemsChange = false,
}: SearchableListProps<T>): React.JSX.Element {
  const { filteredItems, searchBuffer, maxLabelWidth } = useSearch({
    items,
    onSearch,
  });

  const selectionItems = useMemo(
    () =>
      filteredItems.map((item) => ({
        key: item.key,
        value: item,
      })),
    [filteredItems],
  );

  const handleSelectValue = useCallback(
    (item: T) => {
      onSelect(item);
    },
    [onSelect],
  );

  const { activeIndex, setActiveIndex } = useSelectionList({
    items: selectionItems,
    onSelect: handleSelectValue,
    isFocused: true,
    showNumbers: false,
    wrapAround: true,
    priority: true,
  });

  const [scrollOffsetState, setScrollOffsetState] = React.useState(0);

  // Compute effective scroll offset during render to avoid visual flicker
  let scrollOffset = scrollOffsetState;

  if (activeIndex < scrollOffset) {
    scrollOffset = activeIndex;
  } else if (activeIndex >= scrollOffset + maxItemsToShow) {
    scrollOffset = activeIndex - maxItemsToShow + 1;
  }

  const maxScroll = Math.max(0, filteredItems.length - maxItemsToShow);
  if (scrollOffset > maxScroll) {
    scrollOffset = maxScroll;
  }

  // Update state to match derived value if it changed
  if (scrollOffsetState !== scrollOffset) {
    setScrollOffsetState(scrollOffset);
  }

  // Reset selection to top when items change if requested
  const prevItemsRef = React.useRef(filteredItems);
  React.useLayoutEffect(() => {
    if (resetSelectionOnItemsChange && filteredItems !== prevItemsRef.current) {
      setActiveIndex(0);
      setScrollOffsetState(0);
    }
    prevItemsRef.current = filteredItems;
  }, [filteredItems, setActiveIndex, resetSelectionOnItemsChange]);

  // Handle global Escape key to close the list
  useKeypress(
    (key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        onClose();
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const visibleItems = filteredItems.slice(
    scrollOffset,
    scrollOffset + maxItemsToShow,
  );

  const defaultRenderItem = (
    item: T,
    isActive: boolean,
    labelWidth: number,
  ) => (
    <Box flexDirection="row" alignItems="flex-start">
      <Box minWidth={2} flexShrink={0}>
        <Text color={isActive ? theme.status.success : theme.text.secondary}>
          {isActive ? '●' : ''}
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} minWidth={0}>
        <Text color={isActive ? theme.status.success : theme.text.primary}>
          {item.label.padEnd(labelWidth)}
        </Text>
        {item.description && (
          <Text color={theme.text.secondary} wrap="truncate-end">
            {item.description}
          </Text>
        )}
      </Box>
    </Box>
  );

  return (
    <Box flexDirection="column" width="100%" height="100%" paddingX={1}>
      {title && (
        <Box marginBottom={1}>
          <Text bold color={theme.text.primary}>
            {title}
          </Text>
        </Box>
      )}

      {searchBuffer && (
        <Box
          borderStyle="round"
          borderColor={theme.border.default}
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

      {header && <Box marginBottom={1}>{header}</Box>}

      <Box flexDirection="column" flexGrow={1}>
        {filteredItems.length === 0 ? (
          <Box marginX={2}>
            <Text color={theme.text.secondary}>No items found.</Text>
          </Box>
        ) : (
          <>
            {filteredItems.length > maxItemsToShow && (
              <Box marginX={1}>
                <Text color={theme.text.secondary}>▲</Text>
              </Box>
            )}
            {visibleItems.map((item, index) => {
              const isSelected = activeIndex === scrollOffset + index;
              return (
                <Box key={item.key} marginBottom={1} marginX={1}>
                  {renderItem
                    ? renderItem(item, isSelected, maxLabelWidth)
                    : defaultRenderItem(item, isSelected, maxLabelWidth)}
                </Box>
              );
            })}
            {filteredItems.length > maxItemsToShow && (
              <Box marginX={1}>
                <Text color={theme.text.secondary}>▼</Text>
              </Box>
            )}
          </>
        )}
      </Box>

      {footer && (
        <Box marginTop={1}>
          {footer({
            startIndex: scrollOffset,
            endIndex: scrollOffset + visibleItems.length,
            totalVisible: filteredItems.length,
          })}
        </Box>
      )}
    </Box>
  );
}
