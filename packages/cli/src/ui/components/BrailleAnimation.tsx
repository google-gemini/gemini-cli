/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import { Text } from 'ink';
import { debugState } from '../debug.js';
import { useSettings } from '../contexts/SettingsContext.js';

// Dot bitmasks and character assignments for the 4x4 circle perimeter
// Char 0 corresponds to the first Braille character (c1), Char 1 to the second (c2).
const DOTS = [
  { char: 1, bit: 1 }, // Dot 1 (c2)
  { char: 1, bit: 16 }, // Dot 5 (c2)
  { char: 1, bit: 32 }, // Dot 6 (c2)
  { char: 1, bit: 64 }, // Dot 7 (c2)
  { char: 0, bit: 128 }, // Dot 8 (c1)
  { char: 0, bit: 4 }, // Dot 3 (c1)
  { char: 0, bit: 2 }, // Dot 2 (c1)
  { char: 0, bit: 8 }, // Dot 4 (c1)
];

const COMPOSITE_SEQUENCE = [2, 3, 4, 5, 4, 3];

export type BrailleVariant =
  | 'Static'
  | 'Small'
  | 'Medium'
  | 'Long'
  | 'Composite';

interface BrailleAnimationProps {
  variant?: BrailleVariant;
  interval?: number;
  animate?: boolean;
}

/**
 * Braille Snake Animation Component
 *
 * Variants match the prototype style:
 * - 'Static': Fixed frame '⢎⡱'
 * - 'Small': Fixed length 2
 * - 'Medium': Fixed length 3
 * - 'Long': Phased growth (len 1, 3, 5) changing every 8 ticks
 * - 'Composite': Dynamic length [2, 3, 4, 5, 4, 3] changing every 8 ticks
 */
export const BrailleAnimation: React.FC<BrailleAnimationProps> = ({
  variant = 'Composite',
  interval = 80,
  animate = !process.env['VITEST'],
}) => {
  const [tick, setTick] = useState(0);
  const settings = useSettings();
  const shouldShow = settings.merged.ui?.showSpinner !== false;

  useEffect(() => {
    if (!shouldShow || !animate || variant === 'Static') return;

    debugState.debugNumAnimatedComponents++;

    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, interval);

    return () => {
      debugState.debugNumAnimatedComponents--;
      clearInterval(timer);
    };
  }, [interval, shouldShow, animate, variant]);

  const getLength = () => {
    const cycle = Math.floor(tick / 8);
    switch (variant) {
      case 'Small':
        return 2;
      case 'Medium':
        return 3;
      case 'Long':
        return cycle === 0 ? 1 : cycle === 1 ? 3 : 5;
      case 'Composite':
        return COMPOSITE_SEQUENCE[cycle % COMPOSITE_SEQUENCE.length];
      case 'Static':
        return 0;
      default:
        return 5;
    }
  };

  const getFrame = () => {
    if (variant === 'Static') {
      return '⢎⡱';
    }

    const length = getLength();
    let [c1, c2] = [0, 0];
    const head = tick % 8;

    for (let i = 0; i < length; i++) {
      const { char, bit } = DOTS[(head - i + 80) % 8];
      char === 0 ? (c1 |= bit) : (c2 |= bit);
    }

    return String.fromCharCode(0x2800 + c1) + String.fromCharCode(0x2800 + c2);
  };

  if (!shouldShow) {
    return null;
  }

  return <Text>{getFrame()}</Text>;
};
