/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThoughtSummary } from '@google/gemini-cli-core';
import React, { useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { GeminiRespondingSpinner } from './GeminiRespondingSpinner.js';
import { formatDuration } from '../utils/formatters.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';
import {
  announceToScreenReader,
  formatStatusForScreenReader,
} from '../utils/screenReaderUtils.js';

interface LoadingIndicatorProps {
  currentLoadingPhrase?: string;
  elapsedTime: number;
  rightContent?: React.ReactNode;
  thought?: ThoughtSummary | null;
  isReaderMode?: boolean;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  currentLoadingPhrase,
  elapsedTime,
  rightContent,
  thought,
  isReaderMode = false,
}) => {
  const streamingState = useStreamingContext();
  const { columns: terminalWidth } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);
  const previousStreamingState = useRef<StreamingState>(StreamingState.Idle);

  // Announce status changes to screen readers
  useEffect(() => {
    if (streamingState !== previousStreamingState.current && isReaderMode) {
      let announcement = '';
      switch (streamingState) {
        case StreamingState.Responding:
          announcement = 'Generating response';
          break;
        case StreamingState.WaitingForConfirmation:
          announcement = 'Waiting for confirmation';
          break;
        case StreamingState.Idle:
          announcement = 'Ready for input';
          break;
      }

      if (announcement) {
        announceToScreenReader(announcement, isReaderMode);
      }
    }
    previousStreamingState.current = streamingState;
  }, [streamingState, isReaderMode]);

  if (streamingState === StreamingState.Idle) {
    return null;
  }

  const primaryText = formatStatusForScreenReader(
    thought?.subject || currentLoadingPhrase || '',
    isReaderMode,
  );

  const cancelAndTimerContent =
    streamingState !== StreamingState.WaitingForConfirmation
      ? `(esc to cancel, ${elapsedTime < 60 ? `${elapsedTime}s` : formatDuration(elapsedTime * 1000)})`
      : null;

  if (isReaderMode) {
    // Simplified reader mode output - no visual formatting, boxes, or spinners
    return (
      <>
        {primaryText && <Text>{primaryText}</Text>}
        {cancelAndTimerContent && <Text>{cancelAndTimerContent}</Text>}
      </>
    );
  }

  return (
    <Box paddingLeft={0} flexDirection="column">
      {/* Main loading line */}
      <Box
        width="100%"
        flexDirection={isNarrow ? 'column' : 'row'}
        alignItems={isNarrow ? 'flex-start' : 'center'}
      >
        <Box>
          <Box marginRight={1}>
            <GeminiRespondingSpinner
              nonRespondingDisplay={
                streamingState === StreamingState.WaitingForConfirmation
                  ? '⠏'
                  : ''
              }
            />
          </Box>
          {primaryText && (
            <Text color={Colors.AccentPurple}>{primaryText}</Text>
          )}
          {!isNarrow && cancelAndTimerContent && (
            <Text color={Colors.Gray}> {cancelAndTimerContent}</Text>
          )}
        </Box>
        {!isNarrow && <Box flexGrow={1}>{/* Spacer */}</Box>}
        {!isNarrow && rightContent && <Box>{rightContent}</Box>}
      </Box>
      {isNarrow && cancelAndTimerContent && (
        <Box>
          <Text color={Colors.Gray}>{cancelAndTimerContent}</Text>
        </Box>
      )}
      {isNarrow && rightContent && <Box>{rightContent}</Box>}
    </Box>
  );
};
