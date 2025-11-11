/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { lerp } from '../../utils/math.js';
import { type LoadedSettings } from '../../config/settings.js';

const getMainAreaWidthInternal = (terminalWidth: number): number => {
  if (terminalWidth <= 80) {
    return Math.round(0.98 * terminalWidth);
  }
  if (terminalWidth >= 132) {
    return Math.round(0.9 * terminalWidth);
  }

  // Linearly interpolate between 80 columns (98%) and 132 columns (90%).
  const t = (terminalWidth - 80) / (132 - 80);
  const percentage = lerp(98, 90, t);

  return Math.round(percentage * terminalWidth * 0.01);
};

export const calculateMainAreaWidth = (
  terminalWidth: number,
  settings: LoadedSettings,
): number => {
  if (settings.merged.ui?.useFullWidth) {
    if (settings.merged.ui?.useAlternateBuffer) {
      return terminalWidth - 1;
    }
    return terminalWidth;
  }
  return getMainAreaWidthInternal(terminalWidth);
};
