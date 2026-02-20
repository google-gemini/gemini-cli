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
  /**
   * When provided, the component will size the list to the available terminal height
   * rather than using a fixed maxItemsToShow.
   */
  availableTerminalHeight?: number;
  /**
   * Scrolling behavior:
   * - 'center': keep selection roughly centered (previous behavior)
   * - 'keep-visible': only scroll when needed to keep selection visible
   */
  scrollMode?: 'center' | 'keep-visible';
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
  availableTerminalHeight,
  scrollMode = 'center',
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
  });

  // Reset selection to top when items change if requested
  const prevItemsRef = React.useRef(filteredItems);
  React.useEffect(() => {
    if (resetSelectionOnItemsChange && filteredItems !== prevItemsRef.current) {
      setActiveIndex(0);
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

  const computedMaxItemsToShow = useMemo(() => {
    if (availableTerminalHeight === undefined) {
      return maxItemsToShow;
    }

    // Estimate rows taken by chrome. Keep conservative to avoid flicker.
    // - title (optional): 2
    // - search input (optional): 3
    // - header (optional): 2
    // - footer (optional): 2
    const reservedRows =
      (title ? 2 : 0) +
      (searchBuffer ? 3 : 0) +
      (header ? 2 : 0) +
      (footer ? 2 : 0) +
      2; // padding / safety

    const availableForList = Math.max(
      1,
      availableTerminalHeight - reservedRows,
    );
    const approxRowsPerItem = 2;
    const fit = Math.max(1, Math.floor(availableForList / approxRowsPerItem));
    return Math.min(30, fit);
  }, [
    availableTerminalHeight,
    footer,
    header,
    maxItemsToShow,
    searchBuffer,
    title,
  ]);

  const [scrollOffset, setScrollOffset] = React.useState(0);
  const scrollOffsetRef = React.useRef(0);
  React.useEffect(() => {
    scrollOffsetRef.current = scrollOffset;
  }, [scrollOffset]);

  React.useEffect(() => {
    const windowSize = computedMaxItemsToShow;
    const maxScroll = Math.max(0, filteredItems.length - windowSize);

    if (scrollMode === 'keep-visible') {
      const padding = Math.min(1, Math.floor(windowSize / 4));
      const minVisible = scrollOffsetRef.current + padding;
      const maxVisible = scrollOffsetRef.current + (windowSize - 1) - padding;

      let next = scrollOffsetRef.current;
      if (activeIndex < minVisible) {
        next = activeIndex - padding;
      } else if (activeIndex > maxVisible) {
        next = activeIndex - (windowSize - 1) + padding;
      }

      next = Math.max(0, Math.min(next, maxScroll));
      if (next !== scrollOffsetRef.current) {
        setScrollOffset(next);
      }
      return;
    }

    const centered = Math.max(
      0,
      Math.min(
        activeIndex - Math.floor(windowSize / 2),
        Math.max(0, filteredItems.length - windowSize),
      ),
    );
    if (centered !== scrollOffsetRef.current) {
      setScrollOffset(centered);
    }
  }, [activeIndex, computedMaxItemsToShow, filteredItems.length, scrollMode]);

  const visibleItems = filteredItems.slice(
    scrollOffset,
    scrollOffset + computedMaxItemsToShow,
  );

  const defaultRenderItem = (
    item: T,
    isActive: boolean,
    labelWidth: number,
  ) => (
    <Box flexDirection="column">
      <Text
        color={isActive ? theme.status.success : theme.text.primary}
        bold={isActive}
      >
        {isActive ? '> ' : '  '}
        {item.label.padEnd(labelWidth)}
      </Text>
      {item.description && (
        <Box marginLeft={2}>
          <Text color={theme.text.secondary} wrap="truncate-end">
            {item.description}
          </Text>
        </Box>
      )}
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
          visibleItems.map((item, index) => {
            const isSelected = activeIndex === scrollOffset + index;
            return (
              <Box key={item.key} marginBottom={1}>
                {renderItem
                  ? renderItem(item, isSelected, maxLabelWidth)
                  : defaultRenderItem(item, isSelected, maxLabelWidth)}
              </Box>
            );
          })
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
