/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { interpolateColor } from '../themes/color-utils.js';

const FRAME_INTERVAL_MS = 60; // ~16fps — smooth enough for a pulse, cheap on CPU

/**
 * Returns a color that pulses between `activeColor` and `dimColor` on a sine
 * curve. When `active` is false the hook stops its timer and returns
 * `activeColor` at full brightness (static dot).
 */
export function usePulsingColor(
  activeColor: string,
  dimColor: string,
  cycleDurationMs: number,
  active: boolean,
): string {
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (!active) {
      setTime(0);
      return;
    }

    const interval = setInterval(() => {
      setTime((prev) => prev + FRAME_INTERVAL_MS);
    }, FRAME_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [active]);

  if (!active) {
    return activeColor;
  }

  // Sine oscillation: 0 → 1 → 0 over one cycle
  const progress = (Math.sin((2 * Math.PI * time) / cycleDurationMs) + 1) / 2;
  return interpolateColor(dimColor, activeColor, progress) || activeColor;
}
