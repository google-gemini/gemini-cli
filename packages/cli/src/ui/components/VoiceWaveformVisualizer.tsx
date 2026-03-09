/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Text, Box, useIsScreenReaderEnabled } from 'ink';
import { theme } from '../semantic-colors.js';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

interface VoiceWaveformVisualizerProps {
  state: VoiceState;
}

const BARS = 5;

const STATE_LABELS: Record<VoiceState, string> = {
  idle: '',
  listening: 'Listening...',
  processing: 'Processing...',
  speaking: 'Speaking...',
};

const SCREEN_READER_LABELS: Record<VoiceState, string> = {
  idle: '',
  listening: 'Voice mode: listening',
  processing: 'Voice mode: processing',
  speaking: 'Voice mode: speaking',
};

function randomHeight(): number {
  return Math.floor(Math.random() * 7) + 1;
}

export const VoiceWaveformVisualizer: React.FC<
  VoiceWaveformVisualizerProps
> = ({ state }) => {
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const [heights, setHeights] = useState<number[]>(Array(BARS).fill(1));

  useEffect(() => {
    if (state !== 'listening' && state !== 'speaking') {
      setHeights(Array(BARS).fill(1));
      return;
    }
    const interval = setInterval(() => {
      setHeights(Array.from({ length: BARS }, randomHeight));
    }, 150);
    return () => clearInterval(interval);
  }, [state]);

  if (state === 'idle') return null;

  if (isScreenReaderEnabled) {
    return <Text>{SCREEN_READER_LABELS[state]}</Text>;
  }

  const barColor =
    state === 'listening'
      ? theme.text.accent
      : state === 'speaking'
        ? theme.status.success
        : theme.text.secondary;

  return (
    <Box flexDirection="row" alignItems="flex-end" gap={0}>
      <Text color={barColor}>
        {heights.map((h) => '█'.repeat(h) + ' ').join('')}
      </Text>
      <Text color={theme.text.secondary}> {STATE_LABELS[state]}</Text>
    </Box>
  );
};
