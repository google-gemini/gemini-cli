/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Text } from 'ink';
import { useKeypress } from '../../hooks/useKeypress.js';

interface CustomTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  mask?: string;
}

export function CustomTextInput({
  value,
  onChange,
  onSubmit,
  mask,
}: CustomTextInputProps) {
  const [isFocused] = useState(true);

  useKeypress(
    (key) => {
      if (key.name === 'return') {
        onSubmit();
        return;
      }

      if (key.name === 'backspace' || key.name === 'delete') {
        onChange(value.slice(0, -1));
        return;
      }

      if (key.paste && key.sequence) {
        onChange(value + key.sequence);
        return;
      }

      // Allow only printable ASCII characters
      if (
        key.sequence &&
        key.sequence.length === 1 &&
        key.sequence >= ' ' &&
        key.sequence <= '~'
      ) {
        onChange(value + key.sequence);
      }
    },
    { isActive: isFocused },
  );

  const displayValue = mask ? mask.repeat(value.length) : value;

  return <Text>{displayValue}</Text>;
}
