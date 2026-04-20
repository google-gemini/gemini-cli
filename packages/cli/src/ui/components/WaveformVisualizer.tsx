/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Text, useIsScreenReaderEnabled } from 'ink';
import { Colors } from '../colors.js';
import { theme } from '../semantic-colors.js';
import { debugState } from '../debug.js';
import { useSettings } from '../contexts/SettingsContext.js';
import tinygradient from 'tinygradient';

/** Characters representing bar heights from lowest to highest. */
const BAR_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

/** Number of bars in the waveform display. */
const DEFAULT_BAR_COUNT = 16;

/** Animation interval in milliseconds (~10fps). */
const ANIMATION_INTERVAL_MS = 100;

/** Duration (ms) for one full color gradient cycle. */
const COLOR_CYCLE_DURATION_MS = 4000;

export type WaveformMode = 'listening' | 'speaking';

interface WaveformVisualizerProps {
  /** The current mode, controlling the label and animation style. */
  mode?: WaveformMode;
  /** External audio levels (0-1) for each bar. When omitted, levels are simulated. */
  audioLevels?: number[];
  /** Number of bars to display. Defaults to 16. */
  barCount?: number;
  /** Whether the visualizer is active. Defaults to true. */
  active?: boolean;
}

/**
 * Returns a bar character for a given normalized level (0 to 1).
 */
function levelToBar(level: number): string {
  const clamped = Math.max(0, Math.min(1, level));
  const index = Math.round(clamped * (BAR_CHARS.length - 1));
  return BAR_CHARS[index];
}

/**
 * Generates simulated audio levels that look like a natural waveform.
 * Uses overlapping sine waves with slight randomness for organic movement.
 */
function generateSimulatedLevels(
  barCount: number,
  tick: number,
  mode: WaveformMode,
): number[] {
  const levels: number[] = [];
  const baseAmplitude = mode === 'speaking' ? 0.7 : 0.4;

  for (let i = 0; i < barCount; i++) {
    // Combine multiple sine waves at different frequencies for a natural look
    const wave1 = Math.sin(tick * 0.15 + i * 0.5) * 0.3;
    const wave2 = Math.sin(tick * 0.08 + i * 0.8 + 2.0) * 0.2;
    const wave3 = Math.sin(tick * 0.22 + i * 0.3 + 4.0) * 0.15;
    // Small random jitter for liveliness
    const jitter = (Math.random() - 0.5) * 0.15;

    const combined = baseAmplitude + wave1 + wave2 + wave3 + jitter;
    levels.push(Math.max(0, Math.min(1, combined)));
  }
  return levels;
}

const MODE_LABELS: Record<WaveformMode, string> = {
  listening: 'Listening...',
  speaking: 'Speaking...',
};

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  mode = 'listening',
  audioLevels,
  barCount = DEFAULT_BAR_COUNT,
  active = true,
}) => {
  const settings = useSettings();
  const shouldAnimate = settings.merged.ui?.showSpinner !== false;
  const isScreenReaderEnabled = useIsScreenReaderEnabled();

  const [tick, setTick] = useState(0);
  const [colorTime, setColorTime] = useState(0);

  const gradient = useMemo(() => {
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

  // Track animated component for debug/test infrastructure
  useEffect(() => {
    if (active && shouldAnimate && !isScreenReaderEnabled) {
      debugState.debugNumAnimatedComponents++;
      return () => {
        debugState.debugNumAnimatedComponents--;
      };
    }
    return undefined;
  }, [active, shouldAnimate, isScreenReaderEnabled]);

  // Animation loop
  useEffect(() => {
    if (!active || !shouldAnimate || isScreenReaderEnabled) {
      return;
    }

    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
      setColorTime((prev) => prev + ANIMATION_INTERVAL_MS);
    }, ANIMATION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [active, shouldAnimate, isScreenReaderEnabled]);

  const getBarColor = useCallback(
    (barIndex: number) => {
      const progress =
        ((colorTime % COLOR_CYCLE_DURATION_MS) / COLOR_CYCLE_DURATION_MS +
          barIndex / barCount) %
        1;
      return gradient.rgbAt(progress).toHexString();
    },
    [colorTime, barCount, gradient],
  );

  // Screen reader fallback
  if (isScreenReaderEnabled) {
    return <Text>{MODE_LABELS[mode]}</Text>;
  }

  if (!active || !shouldAnimate) {
    return null;
  }

  const levels =
    audioLevels && audioLevels.length >= barCount
      ? audioLevels.slice(0, barCount)
      : generateSimulatedLevels(barCount, tick, mode);

  const bars = levels.map((level, i) => ({
    char: levelToBar(level),
    color: getBarColor(i),
  }));

  return (
    <Box flexDirection="row" alignItems="center">
      <Text color={theme.text.primary} italic>
        {MODE_LABELS[mode]}
      </Text>
      <Text> </Text>
      {bars.map((bar, i) => (
        <Text key={i} color={bar.color}>
          {bar.char}
        </Text>
      ))}
    </Box>
  );
};
