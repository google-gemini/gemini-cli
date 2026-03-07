/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState, useLayoutEffect, useRef } from 'react';
import { Text, Box, getBoundingBox, type DOMElement } from 'ink';
import { theme } from '../../semantic-colors.js';
import { useSelectionList } from '../../hooks/useSelectionList.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { useUIState } from '../../contexts/UIStateContext.js';

import type { SelectionListItem } from '../../hooks/useSelectionList.js';

export interface RenderItemContext {
  isSelected: boolean;
  titleColor: string;
  numberColor: string;
}

export interface BaseSelectionListProps<
  T,
  TItem extends SelectionListItem<T> = SelectionListItem<T>,
> {
  items: TItem[];
  initialIndex?: number;
  onSelect: (value: T) => void;
  onHighlight?: (value: T) => void;
  isFocused?: boolean;
  showNumbers?: boolean;
  showScrollArrows?: boolean;
  maxItemsToShow?: number;
  wrapAround?: boolean;
  focusKey?: string;
  priority?: boolean;
  renderItem: (item: TItem, context: RenderItemContext) => React.ReactNode;
}

/**
 * Base component for selection lists that provides common UI structure
 * and keyboard navigation logic via the useSelectionList hook.
 *
 * This component handles:
 * - Radio button indicators
 * - Item numbering
 * - Scrolling for long lists
 * - Color theming based on selection/disabled state
 * - Keyboard navigation and numeric selection
 *
 * Specific components should use this as a base and provide
 * their own renderItem implementation for custom content.
 */
export function BaseSelectionList<
  T,
  TItem extends SelectionListItem<T> = SelectionListItem<T>,
>({
  items,
  initialIndex = 0,
  onSelect,
  onHighlight,
  isFocused = true,
  showNumbers = true,
  showScrollArrows = false,
  maxItemsToShow = 10,
  wrapAround = true,
  focusKey,
  priority,
  renderItem,
}: BaseSelectionListProps<T, TItem>): React.JSX.Element {
  const { activeIndex } = useSelectionList({
    items,
    initialIndex,
    onSelect,
    onHighlight,
    isFocused,
    showNumbers,
    wrapAround,
    focusKey,
    priority,
  });

  const [scrollOffset, setScrollOffset] = useState(0);
  const containerRef = useRef<DOMElement>(null);
  const [horizontalOffset, setHorizontalOffset] = useState(0);
  const { columns: terminalWidth } = useTerminalSize();
  const uiState = useUIState();
  const mainAreaWidth = uiState?.mainAreaWidth;
  const effectiveTerminalWidth = mainAreaWidth ?? terminalWidth;

  // Measure horizontal offset to allow full-width highlight
  useLayoutEffect(() => {
    if (containerRef.current) {
      const { x } = getBoundingBox(containerRef.current);
      // We want to track the "true" offset relative to the viewport.
      // Since we apply -breakoutAmount as a margin to the SELECTED item,
      // it should not affect the parent container's x coordinate in a standard layout.
      setHorizontalOffset(x);
    }
  }, [terminalWidth, mainAreaWidth]);

  // Handle scrolling for long lists
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

  const visibleItems = items.slice(scrollOffset, scrollOffset + maxItemsToShow);
  const numberColumnWidth = String(items.length).length;

  return (
    <Box flexDirection="column" ref={containerRef}>
      {/* Use conditional coloring instead of conditional rendering */}
      {showScrollArrows && items.length > maxItemsToShow && (
        <Text
          color={scrollOffset > 0 ? theme.text.primary : theme.text.secondary}
        >
          ▲
        </Text>
      )}

      {visibleItems.map((item, index) => {
        const itemIndex = scrollOffset + index;
        const isSelected = activeIndex === itemIndex;

        // Determine colors based on selection and disabled state
        let titleColor = theme.text.primary;
        let numberColor = theme.text.primary;

        if (isSelected) {
          titleColor = theme.ui.focus;
          numberColor = theme.ui.focus;
        } else if (item.disabled) {
          titleColor = theme.text.secondary;
          numberColor = theme.text.secondary;
        }

        if (!isFocused && !item.disabled) {
          numberColor = theme.text.secondary;
        }

        if (!showNumbers) {
          numberColor = theme.text.secondary;
        }

        const itemNumberText = `${String(itemIndex + 1).padStart(
          numberColumnWidth,
        )}.`;

        const breakoutAmount = isSelected
          ? Math.max(0, horizontalOffset - 2)
          : 0;

        return (
          <Box
            key={item.key}
            alignItems="flex-start"
            backgroundColor={isSelected ? theme.background.focus : undefined}
            marginLeft={-breakoutAmount}
            paddingLeft={breakoutAmount}
            width={
              isSelected ? Math.max(1, effectiveTerminalWidth - 4) : '100%'
            }
          >
            {/* Radio button indicator */}
            <Box minWidth={2} flexShrink={0}>
              <Text
                color={isSelected ? theme.ui.focus : theme.text.primary}
                aria-hidden
              >
                {isSelected ? '●' : ' '}
              </Text>
            </Box>

            {/* Item number */}
            {showNumbers && !item.hideNumber && (
              <Box
                marginRight={1}
                flexShrink={0}
                minWidth={itemNumberText.length}
                aria-state={{ checked: isSelected }}
              >
                <Text color={numberColor}>{itemNumberText}</Text>
              </Box>
            )}

            {/* Custom content via render prop */}
            <Box flexGrow={1}>
              {renderItem(item, {
                isSelected,
                titleColor,
                numberColor,
              })}
            </Box>
          </Box>
        );
      })}

      {showScrollArrows && items.length > maxItemsToShow && (
        <Text
          color={
            scrollOffset + maxItemsToShow < items.length
              ? theme.text.primary
              : theme.text.secondary
          }
        >
          ▼
        </Text>
      )}
    </Box>
  );
}
