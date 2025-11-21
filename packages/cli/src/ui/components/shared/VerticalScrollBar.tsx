/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';

export interface VerticalScrollBarProps {
  totalLines: number;
  visibleLines: number;
  scrollOffset: number;
  height?: number;
  thumbColor?: string;
}

export const VerticalScrollBar: React.FC<VerticalScrollBarProps> = ({
  totalLines,
  visibleLines,
  scrollOffset,
  height,
  thumbColor,
}) => {
  if (visibleLines <= 0 || totalLines <= visibleLines) {
    return null;
  }

  const trackLength = height ?? visibleLines;
  const clampedOffset = Math.max(
    0,
    Math.min(scrollOffset, totalLines - visibleLines),
  );

  const thumbLength = Math.max(
    1,
    Math.round((visibleLines / totalLines) * trackLength),
  );
  const maxThumbTop = Math.max(0, trackLength - thumbLength);
  const thumbTop =
    totalLines === visibleLines
      ? 0
      : Math.round((clampedOffset / (totalLines - visibleLines)) * maxThumbTop);

  const scrollbarColor = thumbColor ?? theme.ui.dark;

  return (
    <Box
      flexDirection="column"
      width={1}
      height={trackLength}
      marginLeft={1}
      flexShrink={0}
    >
      {Array.from({ length: trackLength }, (_, rowIdx) => {
        const inThumb = rowIdx >= thumbTop && rowIdx < thumbTop + thumbLength;
        return (
          <Text
            key={rowIdx}
            backgroundColor={inThumb ? scrollbarColor : undefined}
          >
            {' '}
          </Text>
        );
      })}
    </Box>
  );
};
