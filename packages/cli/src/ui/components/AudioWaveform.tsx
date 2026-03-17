/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import { Text, Box } from 'ink';

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

export interface AudioWaveformProps {
  state: VoiceState;
  /**
   * Amplitude samples in [0, 1]. Array length determines the number of bars
   * rendered. When omitted a synthetic animation is generated.
   * @default 20 bars (synthetic)
   */
  amplitudes?: number[];
  /**
   * Total width available in terminal columns (bars + label).
   * @default 40
   */
  width?: number;
}

// Unicode block characters ordered from empty → full (9 levels, indices 0-8).
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

/**
 * Returns a synthetic amplitude array for animated states.
 *
 * - listening / speaking: rippling sine wave across bar positions
 * - processing: all bars pulse together (breathing effect)
 */
function syntheticAmplitudes(
  tick: number,
  barCount: number,
  state: VoiceState,
): number[] {
  if (state === 'processing') {
    const pulse = 0.2 + 0.6 * Math.abs(Math.sin((tick * Math.PI) / 15));
    return Array.from({ length: barCount }, () => pulse);
  }
  return Array.from({ length: barCount }, (_, i) => {
    const phase = (i / barCount) * Math.PI * 2;
    return 0.3 + 0.6 * Math.abs(Math.sin(phase + tick * 0.3));
  });
}

function amplitudeToChar(amp: number): string {
  const index = Math.round(Math.max(0, Math.min(1, amp)) * (BARS.length - 1));
  return BARS[index] ?? '█';
}

/**
 * Animated terminal waveform that visualises the current voice session state.
 *
 * Renders nothing in `idle` state. In all other states a bar chart built from
 * Unicode block characters is shown alongside a text label:
 *
 * ```
 * ▃▄▆█▇▅▃▂▁▂▃▅▆▇█▇▆▅▃▂  listening
 * ▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅  processing
 * ```
 */
export function AudioWaveform({
  state,
  amplitudes,
  width = 40,
}: AudioWaveformProps): React.ReactElement | null {
  const isAnimated =
    state === 'listening' || state === 'processing' || state === 'speaking';

  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isAnimated) return;
    const id = setInterval(() => setTick((t) => t + 1), ANIMATION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isAnimated]);

  if (state === 'idle') return null;

  const label = STATE_LABEL[state];
  // Reserve columns for the label so the total stays within `width`.
  const barCount = Math.max(0, width - label.length);

  let bars: number[];
  if (amplitudes && amplitudes.length > 0) {
    // Resample caller-supplied amplitudes to fit exactly `barCount` bars.
    bars = Array.from({ length: barCount }, (_, i) => {
      const srcIdx = Math.round(
        (i / (barCount - 1 || 1)) * (amplitudes.length - 1),
      );
      return amplitudes[srcIdx];
    });
  } else if (isAnimated) {
    bars = syntheticAmplitudes(tick, barCount, state);
  } else {
    // error state without supplied amplitudes: low flat line
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
