/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { Box, Text } from 'ink';
import { useInput, type Key } from 'ink';
import { Colors } from '../../colors.js';

export interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isFocused?: boolean;
}

export function TextInput({
  value,
  onChange,
  placeholder = '',
  isFocused = false,
}: TextInputProps): React.JSX.Element {
  const handleInput = useCallback(
    (input: string, key: Key) => {
      if (!isFocused) return;

      if (key.backspace) {
        onChange(value.slice(0, -1));
      } else if (key.delete) {
        // Delete key - no action needed for single-line input
      } else if (key.return) {
        // Enter key - no action needed for single-line input
      } else if (input && !key.ctrl && !key.meta) {
        onChange(value + input);
      }
    },
    [value, onChange, isFocused],
  );

  useInput(handleInput, { isActive: isFocused });

  const displayValue = value || (isFocused ? '' : placeholder);

  return (
    <Box borderStyle="round" borderColor={Colors.Gray} paddingX={1}>
      <Text color={value ? Colors.Foreground : Colors.Gray}>
        {displayValue}
        {isFocused && <Text color={Colors.AccentBlue}>|</Text>}
      </Text>
    </Box>
  );
}
