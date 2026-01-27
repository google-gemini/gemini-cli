/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type LoadedSettings } from '../../config/settings.js';
import { isAlternateBufferEnabled } from '../hooks/useAlternateBuffer.js';

export const calculateMainAreaWidth = (
  terminalWidth: number,
  settings: LoadedSettings,
): number => {
  if (isAlternateBufferEnabled(settings)) {
    return terminalWidth - 1;
  }
  return terminalWidth;
};
