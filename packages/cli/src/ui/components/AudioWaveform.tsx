/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Text, Box } from 'ink';
import { debugState } from '../debug.js';

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

export interface AudioWaveformProps {
  state: VoiceState;
  /**
   * Amplitude samples in [0, 1]. When omitted a synthetic animation is
   * generated at 80 ms/tick so the component works before the audio pipeline
   * is wired up.
   */
  amplitudes?: number[];
  /**
   * Total width available in terminal columns (bars + label).
   * @default 40
   */
  width?: number;
}

// Unicode block characters ordered from empty to full (9 levels, indices 0-8).
const BARS = ' ▁▂▃▄▅▆▇█';

const STATE_COLOR: Record<VoiceState, string> = {
  idle: 'gray',
  listening: 'green',
  processing: 'yellow',
  speaking: 'cyan',
  error: 'red',
};

const STATE_LABEL: Record<VoiceState, string> = {
  idle: '',
  listening: ' listening',
  processing: ' processing',
  speaking: ' speaking',
  error: ' error',
};

const ANIMATION_INTERVAL_MS = 80;

function syntheticAmplitudes(
  tick: number,
  barCount: number,
  state: VoiceState,
): number[] {
  if (state === 'processing') {
    const pulse = (1 + Math.sin((tick * Math.PI) / 15)) / 2;
    return Array.from({ length: barCount }, () => 0.2 + 0.6 * pulse);
  }
  return Array.from({ length: barCount }, (_, i) => {
    const phase = (i / barCount) * Math.PI * 2;
    return (1 + Math.sin(phase + tick * 0.3)) / 2;
  });
}

function amplitudeToChar(amp: number): string {
  const index = Math.round(Math.max(0, Math.min(1, amp)) * (BARS.length - 1));
  return BARS[index] ?? '█';
}

/**
 * Animated terminal waveform that visualises the current voice session state.
 *
 * Renders nothing in idle state. In all other states a bar chart built from
 * Unicode block characters is shown alongside a text label.
 */
export function AudioWaveform({
  state,
  amplitudes,
  width = 40,
}: AudioWaveformProps): React.ReactElement | null {
  const safeWidth = Math.max(0, Math.floor(width));
  const isAnimated =
    state === 'listening' || state === 'processing' || state === 'speaking';

  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isAnimated) return;
    debugState.debugNumAnimatedComponents++;
    const id = setInterval(() => setTick((t) => t + 1), ANIMATION_INTERVAL_MS);
    return () => {
      clearInterval(id);
      debugState.debugNumAnimatedComponents--;
    };
  }, [isAnimated]);

  if (state === 'idle') return null;

  const label = STATE_LABEL[state];
  const barCount = Math.max(0, safeWidth - label.length);

  let bars: number[];
  if (amplitudes && amplitudes.length > 0) {
    bars = Array.from({ length: barCount }, (_, i) => {
      const srcIdx = Math.round(
        (i / (barCount - 1 || 1)) * (amplitudes.length - 1),
      );
      return amplitudes[Math.min(srcIdx, amplitudes.length - 1)] ?? 0;
    });
  } else if (isAnimated) {
    bars = syntheticAmplitudes(tick, barCount, state);
  } else {
    bars = Array.from({ length: barCount }, () => 0.15);
  }

  const color = STATE_COLOR[state];
  const waveform = bars.map(amplitudeToChar).join('');

  return (
    <Box>
      <Text color={color}>{waveform}</Text>
      <Text color={color} bold>
        {label}
      </Text>
    </Box>
  );
}
