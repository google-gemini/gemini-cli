/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThoughtSummary } from '@google/gemini-cli-core';
import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { GeminiRespondingSpinner } from './GeminiRespondingSpinner.js';

interface LoadingIndicatorProps {
  currentLoadingPhrase?: string;
  elapsedTime: number;
  rightContent?: React.ReactNode;
  thought?: ThoughtSummary | null;
  circuitBreakerRecoveryTime?: number;
  circuitBreakerAuthType?: string;
  circuitBreakerAllowOverride?: boolean;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  currentLoadingPhrase,
  elapsedTime,
  rightContent,
  thought,
  circuitBreakerRecoveryTime,
  circuitBreakerAuthType,
  circuitBreakerAllowOverride,
}) => {
  const streamingState = useStreamingContext();

  if (streamingState === StreamingState.Idle) {
    return null;
  }

  // Circuit breaker display logic
  if (
    streamingState === StreamingState.CircuitBreakerOpen ||
    streamingState === StreamingState.CircuitBreakerHalfOpen
  ) {
    const recoveryTimeSeconds = Math.ceil(
      (circuitBreakerRecoveryTime || 0) / 1000,
    );
    const isOpen = streamingState === StreamingState.CircuitBreakerOpen;
    const statusText = isOpen ? 'Circuit breaker open' : 'Testing recovery...';
    const overrideText =
      isOpen && circuitBreakerAllowOverride
        ? " Press 'o' to override (risky)"
        : '';

    return (
      <Box marginTop={1} paddingLeft={0} flexDirection="column">
        <Box>
          <Box marginRight={1}>
            <Text color={Colors.Gray}>🚫</Text>
          </Box>
          <Text color={Colors.AccentPurple}>{statusText}</Text>
          {isOpen && recoveryTimeSeconds > 0 && (
            <Text color={Colors.Gray}>
              {' '}
              - Recovery in {recoveryTimeSeconds}s
            </Text>
          )}
          {overrideText && <Text color={Colors.Gray}>{overrideText}</Text>}
        </Box>
        {circuitBreakerAuthType && (
          <Box marginLeft={2}>
            <Text color={Colors.Gray}>Auth type: {circuitBreakerAuthType}</Text>
          </Box>
        )}
      </Box>
    );
  }

  const primaryText = thought?.subject || currentLoadingPhrase;

  return (
    <Box marginTop={1} paddingLeft={0} flexDirection="column">
      {/* Main loading line */}
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
        {primaryText && <Text color={Colors.AccentPurple}>{primaryText}</Text>}
        <Text color={Colors.Gray}>
          {streamingState === StreamingState.WaitingForConfirmation
            ? ''
            : ` (esc to cancel, ${elapsedTime}s)`}
        </Text>
        <Box flexGrow={1}>{/* Spacer */}</Box>
        {rightContent && <Box>{rightContent}</Box>}
      </Box>
    </Box>
  );
};
