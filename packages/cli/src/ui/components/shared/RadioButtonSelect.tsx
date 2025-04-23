/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import SelectInput, {
  type ItemProps as InkSelectItemProps,
  type IndicatorProps as InkSelectIndicatorProps,
} from 'ink-select-input';
import { Colors } from '../../colors.js';

/**
 * Represents a single option for the RadioButtonSelect.
 * Requires a label for display and a value to be returned on selection.
 */
export interface RadioSelectItem<T> {
  label: string;
  value: T;
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
}

/**
 * Custom indicator component displaying radio button style (◉/○).
 */
function RadioIndicator({
  isSelected = false,
}: InkSelectIndicatorProps): React.JSX.Element {
  return (
    <Box marginRight={1}>
      <Text color={isSelected ? Colors.AccentGreen : Colors.Gray}>
        {isSelected ? '◉' : '○'}
      </Text>
    </Box>
  );
}

/**
 * Custom item component for displaying the label with appropriate color.
 */
function RadioItem({
  isSelected = false,
  label,
}: InkSelectItemProps): React.JSX.Element {
  return (
    <Text color={isSelected ? Colors.AccentGreen : Colors.Gray}>{label}</Text>
  );
}

/**
 * A specialized SelectInput component styled to look like radio buttons.
 * It uses '◉' for selected and '○' for unselected items.
 *
 * @template T The type of the value associated with each radio item.
 */
export function RadioButtonSelect<T>({
  items,
  initialIndex,
  onSelect,
}: RadioButtonSelectProps<T>): React.JSX.Element {
  const handleSelect = (item: RadioSelectItem<T>) => {
    onSelect(item.value);
  };
  initialIndex = initialIndex ?? 0;
  return (
    <SelectInput
      indicatorComponent={RadioIndicator}
      itemComponent={RadioItem}
      items={items}
      initialIndex={initialIndex}
      onSelect={handleSelect}
    />
  );
}
