/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Text, useIsScreenReaderEnabled } from 'ink';
import { CliSpinner } from './CliSpinner.js';
import type { SpinnerName } from 'cli-spinners';
import { useStreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import {
  SCREEN_READER_LOADING,
  SCREEN_READER_RESPONDING,
} from '../textConstants.js';
import { theme } from '../semantic-colors.js';
import { Colors } from '../colors.js';
import tinygradient from 'tinygradient';

const COLOR_CYCLE_DURATION_MS = 4000;

interface GeminiRespondingSpinnerProps {
  /**
   * Optional string to display when not in Responding state.
   * If not provided and not Responding, renders null.
   */
  nonRespondingDisplay?: string;
  spinnerType?: SpinnerName;
}

export const GeminiRespondingSpinner: React.FC<
  GeminiRespondingSpinnerProps
> = ({ nonRespondingDisplay, spinnerType = 'dots' }) => {
  const streamingState = useStreamingContext();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  if (streamingState === StreamingState.Responding) {
    return (
      <GeminiSpinner
        spinnerType={spinnerType}
        altText={SCREEN_READER_RESPONDING}
      />
    );
  }

  if (nonRespondingDisplay) {
    return isScreenReaderEnabled ? (
      <Text>{SCREEN_READER_LOADING}</Text>
    ) : (
      <Text color={theme.text.primary}>{nonRespondingDisplay}</Text>
    );
  }

  return null;
};

interface GeminiSpinnerProps {
  spinnerType?: SpinnerName;
  altText?: string;
}

export const GeminiSpinner: React.FC<GeminiSpinnerProps> = ({
  spinnerType = 'dots',
  altText,
}) => {
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const [time, setTime] = useState(0);

  const googleGradient = useMemo(() => {
    const brandColors = [
      Colors.AccentPurple,
      Colors.AccentBlue,
      Colors.AccentCyan,
      Colors.AccentGreen,
      Colors.AccentYellow,
      Colors.AccentRed,
    ];
    return tinygradient([...brandColors, brandColors[0]]);
  }, []);

  useEffect(() => {
    if (isScreenReaderEnabled) {
      return;
    }

    const interval = setInterval(() => {
      setTime((prevTime) => prevTime + 30);
    }, 30); // ~33fps for smooth color transitions

    return () => clearInterval(interval);
  }, [isScreenReaderEnabled]);

  const progress = (time % COLOR_CYCLE_DURATION_MS) / COLOR_CYCLE_DURATION_MS;
  const currentColor = googleGradient.rgbAt(progress).toHexString();

  return isScreenReaderEnabled ? (
    <Text>{altText}</Text>
  ) : (
    <Text color={currentColor}>
      <CliSpinner type={spinnerType} />
    </Text>
  );
};
