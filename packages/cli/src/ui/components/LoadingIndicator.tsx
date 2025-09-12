/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ThoughtSummary } from '@google/gemini-cli-core';
import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { GeminiRespondingSpinner } from './GeminiRespondingSpinner.js';
import { formatDuration } from '../utils/formatters.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';

interface LoadingIndicatorProps {
  currentLoadingPhrase?: string;
  elapsedTime: number;
  rightContent?: React.ReactNode;
  thought?: ThoughtSummary | null;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  currentLoadingPhrase,
  elapsedTime,
  rightContent,
  thought,
}) => {
  const streamingState = useStreamingContext();
  const { columns: terminalWidth } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);
  const safeLineWidth = Math.max(terminalWidth - 1, 1);

  if (streamingState === StreamingState.Idle) {
    return null;
  }

  const primaryText = thought?.subject || currentLoadingPhrase;

  const cancelAndTimerContent =
    streamingState !== StreamingState.WaitingForConfirmation
      ? `(esc to cancel, ${elapsedTime < 60 ? `${elapsedTime}s` : formatDuration(elapsedTime * 1000)})`
      : null;

  return (
    <Box paddingLeft={0} flexDirection="column">
      <Box width={safeLineWidth} flexDirection="row" alignItems="center">
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
          <Text color={theme.text.accent} wrap="truncate-end">
            {primaryText}
            {cancelAndTimerContent ? ` ${cancelAndTimerContent}` : ''}
          </Text>
        )}
        {!primaryText && cancelAndTimerContent && (
          <Text color={theme.text.secondary} wrap="truncate-end">
            {cancelAndTimerContent}
          </Text>
        )}
        {!isNarrow && <Box flexGrow={1}></Box>}
        {!isNarrow && rightContent && <Box>{rightContent}</Box>}
      </Box>
    </Box>
  );
};
