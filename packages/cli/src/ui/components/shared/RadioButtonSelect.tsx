/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { BaseSelectionList } from './BaseSelectionList.js';
import type { SelectionListItem } from '../../hooks/useSelectionList.js';

/**
 * Represents a single option for the RadioButtonSelect.
 * Requires a label for display and a value to be returned on selection.
 */
export interface RadioSelectItem<T> extends SelectionListItem<T> {
  label: string;
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
  isFocused = true,
  showScrollArrows = false,
  maxItemsToShow = 10,
  showNumbers = true,
}: RadioButtonSelectProps<T>): React.JSX.Element {
  return (
    <BaseSelectionList<T, RadioSelectItem<T>>
      items={items}
      initialIndex={initialIndex}
      onSelect={onSelect}
      onHighlight={onHighlight}
      isFocused={isFocused}
      showNumbers={showNumbers}
      showScrollArrows={showScrollArrows}
      maxItemsToShow={maxItemsToShow}
      renderItem={(item, { titleColor }) => {
        // Handle special theme display case for ThemeDialog compatibility
        if (item.themeNameDisplay && item.themeTypeDisplay) {
          return (
            <Text color={titleColor} wrap="truncate" key={item.key}>
              {item.themeNameDisplay}{' '}
              <Text color={theme.text.secondary}>{item.themeTypeDisplay}</Text>
            </Text>
          );
        }
        // Regular label display
        return (
          <Text color={titleColor} wrap="truncate">
            {item.label}
          </Text>
        );
      }}
    />
  );
}
