/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

interface ProgressBarProps {
  value: number; // 0 to 100
  width: number;
  warningThreshold?: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  width,
  warningThreshold = 80,
}) => {
  const safeValue = Math.min(Math.max(value, 0), 100);
  const activeChars = Math.round((safeValue / 100) * width);
  const inactiveChars = width - activeChars;

  let color = Colors.Foreground;
  if (safeValue >= 100) {
    color = Colors.AccentRed;
  } else if (safeValue >= warningThreshold) {
    color = Colors.AccentYellow;
  }

  return (
    <Box flexDirection="row">
      <Text color={color}>{'🬋'.repeat(activeChars)}</Text>
      <Text color={Colors.DarkGray}>{'🬋'.repeat(inactiveChars)}</Text>
    </Box>
  );
};
