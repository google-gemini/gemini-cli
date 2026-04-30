/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import { Text } from 'ink';

const WAVE_CHARS = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export interface ListeningIndicatorProps {
  color?: string;
}

export const ListeningIndicator: React.FC<ListeningIndicatorProps> = ({
  color,
}) => {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // 80ms interval provides a smooth 12.5 FPS animation
    const timer = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(timer);
  }, []);

  // Generate 4 bars for the wave
  const bars = Array.from({ length: 4 }).map((_, i) => {
    // Sine wave calculation to map to our 8 block characters (0-7)
    const phase = tick * 0.4 + i * 0.8;
    const height = Math.floor((Math.sin(phase) + 1) * 3.5);
    return WAVE_CHARS[Math.max(0, Math.min(7, height))] ?? ' ';
  });

  return <Text color={color}>{bars.join(' ')}</Text>;
};
