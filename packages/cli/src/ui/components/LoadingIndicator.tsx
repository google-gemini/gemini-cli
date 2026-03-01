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
import { INTERACTIVE_SHELL_WAITING_PHRASE } from '../hooks/usePhraseCycler.js';

interface LoadingIndicatorProps {
  currentLoadingPhrase?: string;
  wittyPhrase?: string;
  wittyPosition?: 'status' | 'inline' | 'ambient';
  elapsedTime: number;
  inline?: boolean;
  rightContent?: React.ReactNode;
  thought?: ThoughtSummary | null;
  thoughtLabel?: string;
  showCancelAndTimer?: boolean;
  forceRealStatusOnly?: boolean;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  currentLoadingPhrase,
  wittyPhrase,
  wittyPosition = 'inline',
  elapsedTime,
  inline = false,
  rightContent,
  thought,
  thoughtLabel,
  showCancelAndTimer = true,
  forceRealStatusOnly = false,
}) => {
  const streamingState = useStreamingContext();
  const { columns: terminalWidth } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);

  if (
    streamingState === StreamingState.Idle &&
    !currentLoadingPhrase &&
    !thought
  ) {
    return null;
  }

  // Prioritize the interactive shell waiting phrase over the thought subject
  // because it conveys an actionable state for the user (waiting for input).
  const primaryText =
    currentLoadingPhrase === INTERACTIVE_SHELL_WAITING_PHRASE
      ? currentLoadingPhrase
      : thought?.subject
        ? (thoughtLabel ?? thought.subject)
        : forceRealStatusOnly
          ? wittyPosition === 'status' && wittyPhrase
            ? wittyPhrase
            : streamingState === StreamingState.Responding
              ? 'Waiting for model...'
              : undefined
          : currentLoadingPhrase;
  const thinkingIndicator = '';

  const cancelAndTimerContent =
    showCancelAndTimer &&
    streamingState !== StreamingState.WaitingForConfirmation
      ? `esc to cancel, ${elapsedTime < 60 ? `${elapsedTime}s` : formatDuration(elapsedTime * 1000)}`
      : null;

  const wittyPhraseNode =
    forceRealStatusOnly &&
    wittyPosition === 'inline' &&
    wittyPhrase &&
    primaryText ? (
      <Box marginLeft={1}>
        <Text color={theme.text.secondary}>{wittyPhrase}</Text>
      </Box>
    ) : null;

  if (inline) {
    return (
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
          <Text
            color={theme.text.primary}
            italic
            wrap={isNarrow ? 'wrap' : 'truncate-end'}
          >
            {thinkingIndicator}
            {primaryText}
          </Text>
        )}
        {wittyPhraseNode}
        {cancelAndTimerContent && (
          <>
            <Box flexShrink={0} width={1} />
            <Text color={theme.text.secondary}>{cancelAndTimerContent}</Text>
          </>
        )}
      </Box>
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
            <Text
              color={theme.text.primary}
              italic
              wrap={isNarrow ? 'wrap' : 'truncate-end'}
            >
              {thinkingIndicator}
              {primaryText}
            </Text>
          )}
          {wittyPhraseNode}
          {!isNarrow && cancelAndTimerContent && (
            <>
              <Box flexShrink={0} width={1} />
              <Text color={theme.text.secondary}>{cancelAndTimerContent}</Text>
            </>
          )}
        </Box>
        {!isNarrow && <Box flexGrow={1}>{/* Spacer */}</Box>}
        {!isNarrow && rightContent && <Box>{rightContent}</Box>}
      </Box>
      {isNarrow && cancelAndTimerContent && (
        <Box>
          <Text color={theme.text.secondary}>{cancelAndTimerContent}</Text>
        </Box>
      )}
      {isNarrow && rightContent && <Box>{rightContent}</Box>}
    </Box>
  );
};
