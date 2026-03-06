/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useOverflowState } from '../contexts/OverflowContext.js';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';

interface ShowMoreLinesProps {
  /** Explicitly set if height is constrained. */
  constrainHeight: boolean;
  /** Optional: manually override the overflow detection. */
  isOverflowing?: boolean;
}

export const ShowMoreLines: React.FC<ShowMoreLinesProps> = ({
  constrainHeight,
  isOverflowing: isOverflowingProp,
}) => {
  const overflowState = useOverflowState();
  const streamingState = useStreamingContext();

  const isOverflowing =
    isOverflowingProp ??
    (overflowState !== undefined && overflowState.overflowingIds.size > 0);

  if (
    !isOverflowing ||
    !constrainHeight ||
    !(
      streamingState === StreamingState.Idle ||
      streamingState === StreamingState.WaitingForConfirmation ||
      streamingState === StreamingState.Responding
    )
  ) {
    return null;
  }

  return (
    <Box paddingX={1} marginBottom={1}>
      <Text color={theme.text.accent} wrap="truncate">
        Press Ctrl+O to show more lines
      </Text>
    </Box>
  );
};
