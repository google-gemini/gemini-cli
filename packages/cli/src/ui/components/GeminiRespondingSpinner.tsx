/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, useIsScreenReaderEnabled } from 'ink';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import {
  SCREEN_READER_LOADING,
  SCREEN_READER_RESPONDING,
} from '../textConstants.js';
import { theme } from '../semantic-colors.js';
import { GeminiSpinner } from './GeminiSpinner.js';
import { type CircularSpinnerVariant } from './CircularSpinner.js';

interface GeminiRespondingSpinnerProps {
  /**
   * Optional string to display when not in Responding state.
   * If not provided and not Responding, renders null.
   */
  nonRespondingDisplay?: string;
  variant?: CircularSpinnerVariant;
  /**
   * If true, we prioritize showing the nonRespondingDisplay (hook icon)
   * even if the state is Responding.
   */
  isHookActive?: boolean;
  color?: string;
}

export const GeminiRespondingSpinner: React.FC<
  GeminiRespondingSpinnerProps
> = ({
  nonRespondingDisplay,
  variant = 'Composite',
  isHookActive = false,
  color,
}) => {
  const streamingState = useStreamingContext();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();

  // If a hook is active, we want to show the hook icon (nonRespondingDisplay)
  // to be consistent, instead of the rainbow spinner which means "Gemini is talking".
  if (streamingState === StreamingState.Responding && !isHookActive) {
    return (
      <GeminiSpinner variant={variant} altText={SCREEN_READER_RESPONDING} />
    );
  }

  if (nonRespondingDisplay) {
    return isScreenReaderEnabled ? (
      <Text>{SCREEN_READER_LOADING}</Text>
    ) : (
      <Text color={color ?? theme.text.primary}>{nonRespondingDisplay}</Text>
    );
  }

  return null;
};
