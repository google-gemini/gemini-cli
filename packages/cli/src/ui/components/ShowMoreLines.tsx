/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useOverflowState } from '../contexts/OverflowContext.js';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { Colors } from '../colors.js';

interface ShowMoreLinesProps {
  constrainHeight: boolean;
}

export const ShowMoreLines = ({ constrainHeight }: ShowMoreLinesProps) => {
  const overflowState = useOverflowState();
  const streamingState = useStreamingContext();

  if (
    overflowState === undefined ||
    overflowState.overflowingIds.size === 0 ||
    !constrainHeight ||
    !(
      streamingState === StreamingState.Idle ||
      streamingState === StreamingState.WaitingForConfirmation
    )
  ) {
    return null;
  }

  return (
    <Box>
      <Text color={Colors.Gray} wrap="truncate">
        Press ctrl-s to show more lines
      </Text>
    </Box>
  );
};
