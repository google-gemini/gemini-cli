/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Box, Text, useIsScreenReaderEnabled } from 'ink';
import { CliSpinner } from './CliSpinner.js';
import type { SpinnerName } from 'cli-spinners';
import { Colors } from '../colors.js';
import tinygradient from 'tinygradient';
import { inTmux } from '../utils/commandUtils.js';

const COLOR_CYCLE_DURATION_MS = 4000;
const SPINNER_UPDATE_INTERVAL_MS = 30;
const TMUX_UPDATE_INTERVAL_MS = 750;
const TMUX_FRAMES = ['.', '..', '...'] as const;

interface GeminiSpinnerProps {
  spinnerType?: SpinnerName;
  altText?: string;
}

export const GeminiSpinner: React.FC<GeminiSpinnerProps> = ({
  spinnerType = 'dots',
  altText,
}) => {
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const isTmux = inTmux();
  const [time, setTime] = useState(0);
  const [tmuxFrameIndex, setTmuxFrameIndex] = useState(0);

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

    const interval = setInterval(
      () => {
        if (isTmux) {
          setTmuxFrameIndex(
            (prevIndex) => (prevIndex + 1) % TMUX_FRAMES.length,
          );
          return;
        }
        setTime((prevTime) => prevTime + SPINNER_UPDATE_INTERVAL_MS);
      },
      isTmux ? TMUX_UPDATE_INTERVAL_MS : SPINNER_UPDATE_INTERVAL_MS,
    );

    return () => clearInterval(interval);
  }, [isScreenReaderEnabled, isTmux]);

  const progress = (time % COLOR_CYCLE_DURATION_MS) / COLOR_CYCLE_DURATION_MS;
  const currentColor = googleGradient.rgbAt(progress).toHexString();

  return isScreenReaderEnabled ? (
    <Text>{altText}</Text>
  ) : isTmux ? (
    <Box width={3}>
      <Text>{TMUX_FRAMES[tmuxFrameIndex]}</Text>
    </Box>
  ) : (
    <Text color={currentColor}>
      <CliSpinner type={spinnerType} />
    </Text>
  );
};
