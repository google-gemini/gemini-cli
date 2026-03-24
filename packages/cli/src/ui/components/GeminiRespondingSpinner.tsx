/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, useIsScreenReaderEnabled } from 'ink';
import type { SpinnerName } from 'cli-spinners';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import {
  SCREEN_READER_LOADING,
  SCREEN_READER_RESPONDING,
} from '../textConstants.js';
import { theme } from '../semantic-colors.js';
import { GeminiSpinner } from './GeminiSpinner.js';
interface GeminiRespondingSpinnerProps {
  /**
   * Optional string or component to display when not in Responding state.
   * If not provided and not Responding, renders null.
   */
  nonRespondingDisplay?: React.ReactNode;
  spinnerType?: SpinnerName | 'dynamic';
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
  spinnerType = 'dynamic',
  isHookActive = false,
  color,
}) => {
  const streamingState = useStreamingContext();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();

  // If a hook is active, we want to show the hook icon (nonRespondingDisplay)
  // to be consistent, instead of the rainbow spinner which means "Gemini is talking".
  if (streamingState === StreamingState.Responding && !isHookActive) {
    return (
      <GeminiSpinner
        spinnerType={spinnerType}
        altText={SCREEN_READER_RESPONDING}
      />
    );
  }

  if (nonRespondingDisplay) {
    if (isScreenReaderEnabled) {
      return <Text>{SCREEN_READER_LOADING}</Text>;
    }

    return typeof nonRespondingDisplay === 'string' ? (
      <Text color={color ?? theme.text.primary}>{nonRespondingDisplay}</Text>
    ) : (
      <>{nonRespondingDisplay}</>
    );
  }

  return null;
};
