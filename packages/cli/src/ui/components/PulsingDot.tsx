/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import { usePulsingColor } from '../hooks/usePulsingColor.js';

interface PulsingDotProps {
  /** Full-brightness color */
  color: string;
  /** Dim color at the trough of the pulse */
  dimColor: string;
  /** Duration of one full pulse cycle in ms */
  cycleDurationMs: number;
  /** Whether the dot is actively pulsing. When false, renders static at full color. */
  active: boolean;
  /** Optional label text rendered after the dot */
  label?: string;
}

export const PulsingDot: React.FC<PulsingDotProps> = ({
  color,
  dimColor,
  cycleDurationMs,
  active,
  label,
}) => {
  const currentColor = usePulsingColor(
    color,
    dimColor,
    cycleDurationMs,
    active,
  );

  return (
    <Text color={currentColor}>
      {active ? '◉' : '●'} {label}
    </Text>
  );
};
