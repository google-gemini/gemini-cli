/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useOverflowState } from '../contexts/OverflowContext.js';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { theme } from '../semantic-colors.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';

interface ShowMoreLinesProps {
  constrainHeight: boolean;
  isOverflowing?: boolean;
}

export const ShowMoreLines = ({
  constrainHeight,
  isOverflowing: isOverflowingProp,
}: ShowMoreLinesProps) => {
  const isAlternateBuffer = useAlternateBuffer();
  const overflowState = useOverflowState();
  const streamingState = useStreamingContext();

  const isOverflowing =
    isOverflowingProp ??
    (overflowState !== undefined && overflowState.overflowingIds.size > 0);

  if (
    !isAlternateBuffer ||
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
