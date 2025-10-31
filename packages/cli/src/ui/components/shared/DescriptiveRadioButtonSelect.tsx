/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../../semantic-colors.js';
import { BaseSelectionList } from './BaseSelectionList.js';
import type { SelectionListItem } from '../../hooks/useSelectionList.js';

export interface DescriptiveRadioSelectItem<T> extends SelectionListItem<T> {
  title: string;
  description: string;
}

export interface DescriptiveRadioButtonSelectProps<T> {
  /** An array of items to display as descriptive radio options. */
  items: Array<DescriptiveRadioSelectItem<T>>;
  /** The initial index selected */
  initialIndex?: number;
  /** Function called when an item is selected. Receives the `value` of the selected item. */
  onSelect: (value: T) => void;
  /** Function called when an item is highlighted. Receives the `value` of the selected item. */
  onHighlight?: (value: T) => void;
  /** Whether this select input is currently focused and should respond to input. */
  isFocused?: boolean;
  /** Whether to show numbers next to items. */
  showNumbers?: boolean;
  /** Whether to show the scroll arrows. */
  showScrollArrows?: boolean;
  /** The maximum number of items to show at once. */
  maxItemsToShow?: number;
}

/**
 * A radio button select component that displays items with title and description.
 *
 * @template T The type of the value associated with each descriptive radio item.
 */
export function DescriptiveRadioButtonSelect<T>({
  items,
  initialIndex = 0,
  onSelect,
  onHighlight,
  isFocused = true,
  showNumbers = false,
  showScrollArrows = false,
  maxItemsToShow = 10,
}: DescriptiveRadioButtonSelectProps<T>): React.JSX.Element {
  return (
    <BaseSelectionList<T, DescriptiveRadioSelectItem<T>>
      items={items}
      initialIndex={initialIndex}
      onSelect={onSelect}
      onHighlight={onHighlight}
      isFocused={isFocused}
      showNumbers={showNumbers}
      showScrollArrows={showScrollArrows}
      maxItemsToShow={maxItemsToShow}
      renderItem={(item, { titleColor }) => (
        <Box flexDirection="column" key={item.key}>
          <Text color={titleColor}>{item.title}</Text>
          <Text color={theme.text.secondary}>{item.description}</Text>
        </Box>
      )}
    />
  );
}
