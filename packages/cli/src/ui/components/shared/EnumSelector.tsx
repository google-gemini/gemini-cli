/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import type { SettingOption } from '../../../config/settingsSchema.js';

interface EnumSelectorProps {
  options: readonly SettingOption[];
  currentValue: string;
  isActive: boolean;
  onValueChange: (value: string) => void;
}

/**
 * A left-right scrolling selector for enum values
 */
export function EnumSelector({
  options,
  currentValue,
  isActive,
  onValueChange: _onValueChange,
}: EnumSelectorProps): React.JSX.Element {
  // Guard against empty options array
  if (!options || options.length === 0) {
    return <Box />;
  }

  const [currentIndex, setCurrentIndex] = useState(() => {
    const index = options.findIndex((option) => option.value === currentValue);
    return index >= 0 ? index : 0;
  });

  // Update index when currentValue changes externally
  useEffect(() => {
    const index = options.findIndex((option) => option.value === currentValue);
    // Always update index, defaulting to 0 if value not found
    setCurrentIndex(index >= 0 ? index : 0);
  }, [currentValue, options]);

  // Left/right navigation is handled by parent component
  // This component is purely for display
  // onValueChange is kept for interface compatibility but not used internally

  const currentOption = options[currentIndex] || options[0];
  const canScrollLeft = options.length > 1;
  const canScrollRight = options.length > 1;

  return (
    <Box flexDirection="row" alignItems="center">
      <Text
        color={isActive && canScrollLeft ? Colors.AccentGreen : Colors.Gray}
      >
        {canScrollLeft ? '←' : ' '}
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
        {canScrollRight ? '→' : ' '}
      </Text>
    </Box>
  );
}

// Export the interface for external use
export type { EnumSelectorProps };
