/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useKeypress } from '../../hooks/useKeypress.js';
import { Colors } from '../../colors.js';

interface ButtonProps {
  onSelect: () => void;
  children: React.ReactNode;
  isFocused?: boolean;
}

export function Button({ onSelect, children, isFocused = true }: ButtonProps) {
  useKeypress(
    (key) => {
      if (key.name === 'return') {
        onSelect();
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={isFocused ? Colors.AccentGreen : Colors.Gray}
      paddingX={1}
    >
      <Text color={isFocused ? Colors.AccentGreen : Colors.Foreground}>
        {children}
      </Text>
    </Box>
  );
}
