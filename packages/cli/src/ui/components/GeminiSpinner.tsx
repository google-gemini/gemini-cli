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
import { Colors } from '../colors.js';
import tinygradient from 'tinygradient';
import { BrailleAnimation } from './BrailleAnimation.js';
import { useSettings } from '../contexts/SettingsContext.js';

const COLOR_CYCLE_DURATION_MS = 4000;

interface GeminiSpinnerProps {
  spinnerType?: SpinnerName | 'dynamic';
  altText?: string;
}

export const GeminiSpinner: React.FC<GeminiSpinnerProps> = ({
  spinnerType = 'dynamic',
  altText,
}) => {
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const settings = useSettings();
  const shouldShow = settings.merged.ui?.showSpinner !== false;
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
    if (isScreenReaderEnabled || !shouldShow) {
      return;
    }

    const interval = setInterval(() => {
      setTime((prevTime) => prevTime + 30);
    }, 30); // ~33fps for smooth color transitions

    return () => clearInterval(interval);
  }, [isScreenReaderEnabled, shouldShow]);

  const progress = (time % COLOR_CYCLE_DURATION_MS) / COLOR_CYCLE_DURATION_MS;
  const currentColor = googleGradient.rgbAt(progress).toHexString();

  const renderSpinner = () => {
    if (spinnerType === 'dynamic') {
      return <BrailleAnimation variant="Composite" />;
    }

    return <CliSpinner type={spinnerType} />;
  };

  return isScreenReaderEnabled ? (
    <Text>{altText}</Text>
  ) : (
    <Text color={currentColor}>{renderSpinner()}</Text>
  );
};
