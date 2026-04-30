/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Text, useIsScreenReaderEnabled } from 'ink';
import { Colors } from '../colors.js';

/** Number of bars in the audio wave visualization. */
const BAR_COUNT = 8;

/** Characters used for different bar heights (empty to full). */
const BAR_LEVELS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/** Interval in ms between animation frames (~15fps for smooth feel). */
const FRAME_INTERVAL_MS = 66;

/** Full cycle duration in ms for the wave pattern. */
const CYCLE_DURATION_MS = 1200;

interface AudioWaveIndicatorProps {
  /** Whether the indicator is currently connecting (shows pulsing dot). */
  isConnecting?: boolean;
}

/**
 * An animated audio wave indicator for voice recording mode.
 *
 * Displays a compact, dynamic audio wave animation using Unicode block
 * characters while audio is being recorded. Falls back to a simple text
 * label when a screen reader is active.
 *
 * The animation uses a sinusoidal wave pattern that cycles smoothly,
 * providing visual feedback that the microphone is actively capturing audio.
 */
export const AudioWaveIndicator: React.FC<AudioWaveIndicatorProps> = ({
  isConnecting = false,
}) => {
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (isScreenReaderEnabled) {
      return;
    }

    const interval = setInterval(() => {
      setFrame((prev) => prev + 1);
    }, FRAME_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isScreenReaderEnabled]);

  if (isScreenReaderEnabled) {
    return <Text>Recording audio...</Text>;
  }

  if (isConnecting) {
    // Pulsing dot animation while connecting
    const dotCount = (frame % 12) < 4 ? 1 : (frame % 12) < 8 ? 2 : 3;
    return (
      <Text color={Colors.AccentGreen}>
        🎙️ Connecting{'.'.repeat(dotCount)}
      </Text>
    );
  }

  // Generate wave bars using sinusoidal pattern with phase offset per bar
  const elapsed = (frame * FRAME_INTERVAL_MS) % CYCLE_DURATION_MS;
  const phase = (elapsed / CYCLE_DURATION_MS) * Math.PI * 2;

  let bars = '';
  for (let i = 0; i < BAR_COUNT; i++) {
    // Each bar has a slightly different phase for a wave effect
    const barPhase = phase + (i / BAR_COUNT) * Math.PI;
    // Map sine wave [-1, 1] to bar level index [0, BAR_LEVELS.length - 1]
    const normalized = (Math.sin(barPhase) + 1) / 2;
    const levelIndex = Math.floor(normalized * (BAR_LEVELS.length - 1));
    bars += BAR_LEVELS[levelIndex];
  }

  return (
    <Text color={Colors.AccentGreen}>
      🎙️ <Text bold>{bars}</Text>
    </Text>
  );
};
