/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
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
  disabled?: boolean;
}

/**
 * Props for the RadioButtonSelect component.
 * @template T The type of the value associated with each radio item.
 */
export interface RadioButtonSelectProps<T> {
  /** An array of items to display as radio options. */
  items: Array<
    RadioSelectItem<T> & {
      themeNameDisplay?: string;
      themeTypeDisplay?: string;
    }
  >;

  /** The initial index selected */
  initialIndex?: number;

  /** Function called when an item is selected. Receives the `value` of the selected item. */
  onSelect: (value: T) => void;

  /** Function called when an item is highlighted. Receives the `value` of the selected item. */
  onHighlight?: (value: T) => void;

  /** Whether this select input is currently focused and should respond to input. */
  isFocused?: boolean;
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
  onHighlight,
  isFocused, // This prop indicates if the current RadioButtonSelect group is focused
}: RadioButtonSelectProps<T>): React.JSX.Element {
  const handleSelect = (item: RadioSelectItem<T>) => {
    onSelect(item.value);
  };
  const handleHighlight = (item: RadioSelectItem<T>) => {
    if (onHighlight) {
      onHighlight(item.value);
    }
  };

  /**
   * Custom indicator component displaying radio button style (◉/○).
   * Color changes based on whether the item is selected and if its group is focused.
   */
  function DynamicRadioIndicator({
    isSelected = false,
  }: InkSelectIndicatorProps): React.JSX.Element {
    return (
      <Box minWidth={2} flexShrink={0}>
        <Text color={isSelected ? Colors.AccentGreen : Colors.Foreground}>
          {isSelected ? '●' : '○'}
        </Text>
      </Box>
    );
  }

  /**
   * Custom item component for displaying the label.
   * Color changes based on whether the item is selected and if its group is focused.
   * Now also handles displaying theme type with custom color.
   */
  function CustomThemeItemComponent(
    props: InkSelectItemProps,
  ): React.JSX.Element {
    const { isSelected = false, label } = props;
    const itemWithThemeProps = props as typeof props & {
      themeNameDisplay?: string;
      themeTypeDisplay?: string;
      disabled?: boolean;
    };

    let textColor = Colors.Foreground;
    if (isSelected) {
      textColor = Colors.AccentGreen;
    } else if (itemWithThemeProps.disabled === true) {
      textColor = Colors.Gray;
    }

    if (
      itemWithThemeProps.themeNameDisplay &&
      itemWithThemeProps.themeTypeDisplay
    ) {
      return (
        <Text color={textColor} wrap="truncate">
          {itemWithThemeProps.themeNameDisplay}{' '}
          <Text color={Colors.Gray}>{itemWithThemeProps.themeTypeDisplay}</Text>
        </Text>
      );
    }

    return (
      <Text color={textColor} wrap="truncate">
        {label}
      </Text>
    );
  }

  initialIndex = initialIndex ?? 0;
  return (
    <SelectInput
      indicatorComponent={DynamicRadioIndicator}
      itemComponent={CustomThemeItemComponent}
      items={items}
      initialIndex={initialIndex}
      onSelect={handleSelect}
      onHighlight={handleHighlight}
      isFocused={isFocused}
    />
  );
}
