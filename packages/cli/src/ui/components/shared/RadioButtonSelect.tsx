/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { Text, Box, useInput } from 'ink';
import SelectInput, {
  type ItemProps as InkSelectItemProps,
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

  /** Whether to show numbers next to the options. */
  showNumbers?: boolean;
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
  showNumbers = items.length < 10,
}: RadioButtonSelectProps<T>): React.JSX.Element {
  const inputBuffer = useRef('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  useInput((input, key) => {
    if (!isFocused || !showNumbers || key.meta || key.ctrl) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (/\d/.test(input)) {
      inputBuffer.current += input;

      // Allows for multi-digit input i.e. '10' or greater
      timerRef.current = setTimeout(() => {
        const num = parseInt(inputBuffer.current, 10);
        if (!isNaN(num) && num > 0 && num <= items.length) {
          const selectedItem = items[num - 1];
          if (selectedItem && !selectedItem.disabled) {
            onSelect(selectedItem.value);
          }
        }
        inputBuffer.current = '';
      }, 350);
    } else {
      inputBuffer.current = '';
    }
  });

  const handleSelect = (item: RadioSelectItem<T>) => {
    onSelect(item.value);
  };
  const handleHighlight = (item: RadioSelectItem<T>) => {
    if (onHighlight) {
      onHighlight(item.value);
    }
  };

  /**
   * Custom indicator component that is empty because the CustomThemeItemComponent will render the indicator.
   */
  function EmptyIndicator(): React.JSX.Element {
    return <Box />;
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

    const itemIndex = items.findIndex((item) => item.label === label);
    const currentItem = itemIndex !== -1 ? items[itemIndex] : undefined;

    // Fallback for safety, though should not happen in normal use.
    if (!currentItem) {
      return <Text>{label}</Text>;
    }

    const itemWithThemeProps = currentItem as typeof currentItem & {
      themeNameDisplay?: string;
      themeTypeDisplay?: string;
    };

    let textColor = Colors.Foreground;
    if (isSelected) {
      textColor = Colors.AccentGreen;
    } else if (itemWithThemeProps.disabled === true) {
      textColor = Colors.Gray;
    }

    const numberPrefix = showNumbers ? `[${itemIndex + 1}] ` : '';
    const indicator = isSelected ? '●' : '○';

    const content = itemWithThemeProps.themeNameDisplay ? (
      <>
        {itemWithThemeProps.themeNameDisplay}{' '}
        <Text color={Colors.Gray}>{itemWithThemeProps.themeTypeDisplay}</Text>
      </>
    ) : (
      label
    );

    return (
      <Box>
        <Box minWidth={showNumbers ? 4 : 0}>
          <Text color={Colors.Gray}>{numberPrefix}</Text>
        </Box>
        <Box minWidth={2}>
          <Text color={isSelected ? Colors.AccentGreen : Colors.Foreground}>
            {indicator}
          </Text>
        </Box>
        <Text color={textColor} wrap="truncate">
          {content}
        </Text>
      </Box>
    );
  }

  initialIndex = initialIndex ?? 0;
  return (
    <SelectInput
      indicatorComponent={EmptyIndicator}
      itemComponent={CustomThemeItemComponent}
      items={items}
      initialIndex={initialIndex}
      onSelect={handleSelect}
      onHighlight={handleHighlight}
      isFocused={isFocused}
    />
  );
}
