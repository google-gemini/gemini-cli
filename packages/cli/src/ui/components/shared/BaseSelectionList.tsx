/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { Text, Box } from 'ink';
import { theme } from '../../semantic-colors.js';
import {
  useSelectionList,
  type SelectionListItem,
} from '../../hooks/useSelectionList.js';

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
  selectedIndicator?: string;
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
  selectedIndicator = '●',
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

  // Derive the effective scroll offset during render to avoid "no-selection" flicker.
  // This ensures that the visibleItems calculation uses an offset that includes activeIndex.
  let effectiveScrollOffset = scrollOffset;
  if (activeIndex < effectiveScrollOffset) {
    effectiveScrollOffset = activeIndex;
  } else if (activeIndex >= effectiveScrollOffset + maxItemsToShow) {
    effectiveScrollOffset = Math.max(
      0,
      Math.min(activeIndex - maxItemsToShow + 1, items.length - maxItemsToShow),
    );
  }

  // Ensure offset is within bounds if items length changed
  const maxScroll = Math.max(0, items.length - maxItemsToShow);
  if (effectiveScrollOffset > maxScroll) {
    effectiveScrollOffset = maxScroll;
  }

  // Synchronize state if it changed during derivation
  if (scrollOffset !== effectiveScrollOffset) {
    setScrollOffset(effectiveScrollOffset);
  }

  const visibleItems = items.slice(
    effectiveScrollOffset,
    effectiveScrollOffset + maxItemsToShow,
  );
  const numberColumnWidth = String(items.length).length;

  const canScrollUp = effectiveScrollOffset > 0;
  const canScrollDown = effectiveScrollOffset + maxItemsToShow < items.length;
  const hasScrollArrows = showScrollArrows && items.length > maxItemsToShow;

  return (
    <Box flexDirection="column">
      {visibleItems.map((item, index) => {
        const itemIndex = effectiveScrollOffset + index;
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

        // Determine the indicator character for the radio column
        let indicator = ' ';
        let indicatorColor = theme.text.primary;

        if (isSelected) {
          indicator = selectedIndicator;
          indicatorColor = theme.ui.focus;
        } else if (hasScrollArrows && index === 0 && canScrollUp) {
          indicator = '▲';
          indicatorColor = theme.text.secondary;
        } else if (
          hasScrollArrows &&
          index === visibleItems.length - 1 &&
          canScrollDown
        ) {
          indicator = '▼';
          indicatorColor = theme.text.secondary;
        }

        return (
          <Box
            key={item.key}
            alignItems="flex-start"
            backgroundColor={isSelected ? theme.background.focus : undefined}
          >
            {/* Radio button indicator (also shows scroll arrows inline) */}
            <Box minWidth={2} flexShrink={0}>
              <Text color={indicatorColor} aria-hidden>
                {indicator}
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
    </Box>
  );
}
