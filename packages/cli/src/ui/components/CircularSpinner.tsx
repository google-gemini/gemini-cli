/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, type FC } from 'react';
import { Text } from 'ink';
import { useSettings } from '../contexts/SettingsContext.js';

export type CircularSpinnerVariant =
  | 'Small'
  | 'Medium'
  | 'Long'
  | 'Composite'
  | 'Static';

interface CircularSpinnerProps {
  variant?: CircularSpinnerVariant;
  color?: string;
  /** Individual color for the first character. Overrides 'color' if provided. */
  color1?: string;
  /** Individual color for the second character. Overrides 'color' if provided. */
  color2?: string;
  /** Initial frame index when not controlled. */
  startFrameIndex?: number;
  /** Directly control the frame index for testing. */
  frameIndex?: number;
  /** Whether to animate even in test environment. */
  animateInTests?: boolean;
}

const TICK_MS = 80;

// Dot bitmasks for a circular perimeter across two characters (c1 and c2).
// Row 1: . C1.4 C2.1 .
// Row 2: C1.2 . . C2.5
// Row 3: C1.3 . . C2.6
// Row 4: . C1.8 C2.7 .
// Clockwise sequence: C2.1 -> C2.5 -> C2.6 -> C2.7 -> C1.8 -> C1.3 -> C1.2 -> C1.4
const DOTS = [
  { c1: 0, c2: 0x01 }, // C2.1
  { c1: 0, c2: 0x10 }, // C2.5
  { c1: 0, c2: 0x20 }, // C2.6
  { c1: 0, c2: 0x40 }, // C2.7
  { c1: 0x80, c2: 0 }, // C1.8
  { c1: 0x04, c2: 0 }, // C1.3
  { c1: 0x02, c2: 0 }, // C1.2
  { c1: 0x08, c2: 0 }, // C1.4
];

export const CircularSpinner: FC<CircularSpinnerProps> = ({
  variant = 'Medium',
  color,
  color1,
  color2,
  startFrameIndex = 0,
  frameIndex: controlledFrameIndex,
  animateInTests = false,
}) => {
  const settings = useSettings();
  const showSpinner = settings.merged.ui?.showSpinner !== false;
  const [internalFrameIndex, setInternalFrameIndex] = useState(startFrameIndex);

  useEffect(() => {
    if (controlledFrameIndex === undefined) {
      setInternalFrameIndex(startFrameIndex);
    }
  }, [startFrameIndex, controlledFrameIndex]);

  useEffect(() => {
    if (
      !showSpinner ||
      variant === 'Static' ||
      controlledFrameIndex !== undefined ||
      (process.env['NODE_ENV'] === 'test' && !animateInTests)
    )
      return;

    const interval = setInterval(() => {
      setInternalFrameIndex((prev) => (prev + 1) % 144);
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [showSpinner, variant, controlledFrameIndex, animateInTests]);

  if (!showSpinner) return null;

  if (variant === 'Static') {
    return <Text color={color}>⢎⡱</Text>;
  }

  const effectiveFrameIndex = controlledFrameIndex ?? internalFrameIndex;

  const getTailLength = (index: number) => {
    switch (variant) {
      case 'Small':
        return 2;
      case 'Medium':
        return 3;
      case 'Long': {
        const lengths = [1, 3, 5];
        return lengths[Math.floor(index / 8) % lengths.length];
      }
      case 'Composite': {
        const compositeLengths = [2, 3, 4, 5, 4, 3];
        return compositeLengths[
          Math.floor(index / 12) % compositeLengths.length
        ];
      }
      default:
        return 3;
    }
  };

  const tailLength = getTailLength(effectiveFrameIndex);
  let bits1 = 0;
  let bits2 = 0;

  for (let i = 0; i < tailLength; i++) {
    const idx = ((effectiveFrameIndex % 8) - i + 8) % 8;
    bits1 |= DOTS[idx].c1;
    bits2 |= DOTS[idx].c2;
  }

  const char1 = String.fromCharCode(0x2800 + bits1);
  const char2 = String.fromCharCode(0x2800 + bits2);

  // prettier-ignore
  return (<Text><Text key="c1" color={color1 ?? color}>{char1}</Text><Text key="c2" color={color2 ?? color}>{char2}</Text></Text>);
};
