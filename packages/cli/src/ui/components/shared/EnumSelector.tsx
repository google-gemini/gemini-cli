/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import { SettingOption } from '../../../config/settingsSchema.js';

interface EnumSelectorProps {
  options: readonly SettingOption[];
  currentValue: string;
  isActive: boolean;
  onValueChange: (value: string) => void;
}

/**
 * A left-right scrolling selector for enum values, similar to Claude Code's notification selector
 */
export function EnumSelector({
  options,
  currentValue,
  isActive,
  onValueChange,
}: EnumSelectorProps): React.JSX.Element {
  const [currentIndex, setCurrentIndex] = useState(() => {
    const index = options.findIndex((option) => option.value === currentValue);
    return index >= 0 ? index : 0;
  });

  // Update index when currentValue changes externally
  useEffect(() => {
    const index = options.findIndex((option) => option.value === currentValue);
    if (index >= 0) {
      setCurrentIndex(index);
    }
  }, [currentValue, options]);

  // Left/right navigation is handled by parent component
  // This component is purely for display

  const currentOption = options[currentIndex] || options[0];
  const canScrollLeft = options.length > 1;
  const canScrollRight = options.length > 1;

  return (
    <Box flexDirection="row" alignItems="center">
      <Text
        color={isActive && canScrollLeft ? Colors.AccentGreen : Colors.Gray}
      >
        {canScrollLeft ? '◀' : ' '}
      </Text>
      <Text> </Text>
      <Text
        color={isActive ? Colors.AccentGreen : Colors.Foreground}
        bold={isActive}
      >
        {currentOption.label}
      </Text>
      <Text> </Text>
      <Text
        color={isActive && canScrollRight ? Colors.AccentGreen : Colors.Gray}
      >
        {canScrollRight ? '▶' : ' '}
      </Text>
    </Box>
  );
}

// Export the interface for external use
export type { EnumSelectorProps };
