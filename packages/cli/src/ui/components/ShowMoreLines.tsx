/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { useOverflowState } from '../contexts/OverflowContext.js';
import { Colors } from '../colors.js';

interface ShowMoreLinesProps {
  constrainHeight: boolean;
}

export const ShowMoreLines = ({ constrainHeight }: ShowMoreLinesProps) => {
  const overflowState = useOverflowState();

  if (
    overflowState === undefined ||
    overflowState.overflowingIds.size === 0 ||
    !constrainHeight
  ) {
    return null;
  }

  return (
    <Box>
      <Text color={Colors.Gray} wrap="truncate">
        Press Ctrl-S to show more lines
      </Text>
    </Box>
  );
};
