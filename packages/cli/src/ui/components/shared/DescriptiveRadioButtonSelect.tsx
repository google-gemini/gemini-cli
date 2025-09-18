/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useRef } from 'react';
import { Text, Box } from 'ink';
import { theme } from '../../semantic-colors.js';
import { useKeypress } from '../../hooks/useKeypress.js';

export interface DescriptiveRadioSelectItem<T> {
  value: T;
  title: string;
  description: string;
  disabled?: boolean;
}

export interface DescriptiveRadioButtonSelectProps<T> {
  items: Array<DescriptiveRadioSelectItem<T>>;
  initialIndex?: number;
  onSelect: (value: T) => void;
  onHighlight?: (value: T) => void;
  isFocused?: boolean;
  showNumbers?: boolean;
}

export function DescriptiveRadioButtonSelect<T>({
  items,
  initialIndex = 0,
  onSelect,
  onHighlight,
  isFocused = true,
  showNumbers = false,
}: DescriptiveRadioButtonSelectProps<T>): React.JSX.Element {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [numberInput, setNumberInput] = useState('');
  const numberInputTimer = useRef<NodeJS.Timeout | null>(null);

  useKeypress(
    (key) => {
      const { sequence, name } = key;
      const isNumeric = showNumbers && /^[0-9]$/.test(sequence);

      if (!isNumeric && numberInputTimer.current) {
        clearTimeout(numberInputTimer.current);
        setNumberInput('');
      }

      if (name === 'k' || name === 'up') {
        const newIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
        setActiveIndex(newIndex);
        onHighlight?.(items[newIndex]!.value);
        return;
      }

      if (name === 'j' || name === 'down') {
        const newIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
        setActiveIndex(newIndex);
        onHighlight?.(items[newIndex]!.value);
        return;
      }

      if (name === 'return') {
        onSelect(items[activeIndex]!.value);
        return;
      }

      if (isNumeric) {
        if (numberInputTimer.current) {
          clearTimeout(numberInputTimer.current);
        }

        const newNumberInput = numberInput + sequence;
        setNumberInput(newNumberInput);

        const targetIndex = Number.parseInt(newNumberInput, 10) - 1;

        if (newNumberInput === '0') {
          numberInputTimer.current = setTimeout(() => setNumberInput(''), 350);
          return;
        }

        if (targetIndex >= 0 && targetIndex < items.length) {
          const targetItem = items[targetIndex]!;
          setActiveIndex(targetIndex);
          onHighlight?.(targetItem.value);

          const potentialNextNumber = Number.parseInt(newNumberInput + '0', 10);
          if (potentialNextNumber > items.length) {
            onSelect(targetItem.value);
            setNumberInput('');
          } else {
            numberInputTimer.current = setTimeout(() => {
              onSelect(targetItem.value);
              setNumberInput('');
            }, 350);
          }
        } else {
          setNumberInput('');
        }
      }
    },
    { isActive: !!(isFocused && items.length > 0) },
  );

  return (
    <Box flexDirection="column">
      {items.map((item, index) => {
        const isSelected = activeIndex === index;

        let titleColor = theme.text.primary;
        let numberColor = theme.text.primary;

        if (isSelected) {
          titleColor = theme.status.success;
          numberColor = theme.status.success;
        } else if (item.disabled) {
          titleColor = theme.text.secondary;
          numberColor = theme.text.secondary;
        }

        if (!showNumbers) {
          numberColor = theme.text.secondary;
        }

        const numberColumnWidth = String(items.length).length;
        const itemNumberText = `${String(index + 1).padStart(
          numberColumnWidth,
        )}.`;

        return (
          <Box key={index} flexDirection="row" marginBottom={1}>
            <Box minWidth={2} flexShrink={0}>
              <Text
                color={isSelected ? theme.status.success : theme.text.primary}
              >
                {isSelected ? '●' : ' '}
              </Text>
            </Box>
            {showNumbers && (
              <Box
                marginRight={1}
                flexShrink={0}
                minWidth={itemNumberText.length}
              >
                <Text color={numberColor}>{itemNumberText}</Text>
              </Box>
            )}
            <Box flexDirection="column">
              <Text color={titleColor}>{item.title}</Text>
              <Text color={theme.text.secondary}>{item.description}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
