/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';

export interface CircularProgressProps {
  /** Progress percentage (0 to 1) */
  percentage: number;
  /** Color of the progress indicator */
  color?: string;
}

// Unicode Clock characters for circular progress
const CLOCK_CHARS = [
  '🕛',
  '🕐',
  '🕑',
  '🕒',
  '🕓',
  '🕔',
  '🕕',
  '🕖',
  '🕗',
  '🕘',
  '🕙',
  '🕚',
];

/**
 * A circular progress indicator for the CLI.
 */
export function CircularProgress({
  percentage,
  color = 'cyan',
}: CircularProgressProps): React.JSX.Element {
  const index = Math.min(
    Math.floor(percentage * CLOCK_CHARS.length),
    CLOCK_CHARS.length - 1,
  );
  const char = CLOCK_CHARS[index >= 0 ? index : 0];

  return <Text color={color}>{char}</Text>;
}
