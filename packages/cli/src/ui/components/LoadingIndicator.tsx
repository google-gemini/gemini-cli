/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { Colors } from '../colors.js';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';

interface LoadingIndicatorProps {
  currentLoadingPhrase: string;
  elapsedTime: number;
  rightContent?: React.ReactNode;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  currentLoadingPhrase,
  elapsedTime,
  rightContent,
}) => {
  const { streamingState } = useStreamingContext();

  if (streamingState === StreamingState.Idle) {
    return null;
  }

  return (
    <Box marginTop={1} paddingLeft={0}>
      {streamingState === StreamingState.Responding && (
        <Box marginRight={1}>
          <Spinner type="dots" />
        </Box>
      )}
      <Text color={Colors.AccentPurple}>
        {currentLoadingPhrase}
        {streamingState === StreamingState.WaitingForConfirmation
          ? ''
          : ` (esc to cancel, ${elapsedTime}s)`}
      </Text>
      <Box flexGrow={1}>{/* Spacer */}</Box>
      {rightContent && <Box>{rightContent}</Box>}
    </Box>
  );
};
