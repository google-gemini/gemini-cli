/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from 'ink';

export interface ProgressBorderProps {
  children: React.ReactNode;
  width: number;
  percentage: number;
  borderColor: string;
  minHeight?: number;
  paddingX?: number;
  hideContextPercentage?: boolean;
}

// Characters for the border
const CORNERS = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
};

const LINES = {
  horizontal: '─',
  vertical: '│',
  filled: '▬', // Medium-thick horizontal bar
};

// Bar fills to 100% of width when at 50% token usage (compression threshold)
const COMPRESSION_THRESHOLD_PERCENTAGE = 50;

/**
 * Renders a custom border with a progress indicator on the top edge.
 * The top border uses a thicker line (━) to show progress, filling from left to right.
 * Progress scales so that 50% usage = 100% visual fill.
 */
export const ProgressBorder: React.FC<ProgressBorderProps> = ({
  children,
  width,
  percentage,
  borderColor,
  minHeight = 3,
  paddingX = 1,
  hideContextPercentage = true,
}) => {
  // Calculate visual percentage (0-100% maps to 0-200% visual)
  // Only calculate if we're showing the progress
  const visualPercentage = hideContextPercentage
    ? 0
    : Math.min((percentage / COMPRESSION_THRESHOLD_PERCENTAGE) * 100, 100);

  // Progress bar always uses the same color as the border
  const progressColor = borderColor;

  // Calculate how many characters should be filled
  // Subtract 2 for the corner characters
  const availableWidth = Math.max(0, width - 2);
  const filledWidth = hideContextPercentage
    ? 0
    : Math.round((availableWidth * visualPercentage) / 100);
  const emptyWidth = availableWidth - filledWidth;

  // Build top border (memoized to avoid rebuilding on every render)
  const topBorder = useMemo(
    () =>
      CORNERS.topLeft +
      (filledWidth > 0 ? LINES.filled.repeat(filledWidth) : '') +
      (emptyWidth > 0 ? LINES.horizontal.repeat(emptyWidth) : '') +
      CORNERS.topRight,
    [filledWidth, emptyWidth],
  );

  // Build bottom border (memoized - only changes with width)
  const bottomBorder = useMemo(
    () =>
      CORNERS.bottomLeft +
      LINES.horizontal.repeat(availableWidth) +
      CORNERS.bottomRight,
    [availableWidth],
  );

  return (
    <Box flexDirection="column" width={width}>
      {/* Top border with progress */}
      <Text color={progressColor}>{topBorder}</Text>

      {/* Content area with side borders */}
      <Box flexDirection="row" width={width} minHeight={minHeight - 2}>
        <Text color={borderColor}>{LINES.vertical}</Text>
        <Box flexGrow={1} paddingX={paddingX}>
          {children}
        </Box>
        <Text color={borderColor}>{LINES.vertical}</Text>
      </Box>

      {/* Bottom border */}
      <Text color={borderColor}>{bottomBorder}</Text>
    </Box>
  );
};
