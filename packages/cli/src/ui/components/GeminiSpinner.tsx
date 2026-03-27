/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Text, useIsScreenReaderEnabled } from 'ink';
import {
  CircularSpinner,
  type CircularSpinnerVariant,
} from './CircularSpinner.js';
import { Colors } from '../colors.js';
import tinygradient from 'tinygradient';

const COLOR_CYCLE_DURATION_MS = 4000;

interface GeminiSpinnerProps {
  variant?: CircularSpinnerVariant;
  altText?: string;
}

export const GeminiSpinner: React.FC<GeminiSpinnerProps> = ({
  variant = 'Composite',
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
  const leadingColor = googleGradient.rgbAt(progress).toHexString();
  // Offset the trailing color by ~10% of the cycle duration
  const trailingProgress = (progress - 0.1 + 1) % 1;
  const trailingColor = googleGradient.rgbAt(trailingProgress).toHexString();

  return isScreenReaderEnabled ? (
    <Text>{altText}</Text>
  ) : (
    <CircularSpinner
      variant={variant}
      color1={trailingColor}
      color2={leadingColor}
    />
  );
};
