/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSettings } from '../contexts/SettingsContext.js';
import type { LoadedSettings } from '../../config/settings.js';
import process from 'node:process';

export const isAlternateBufferEnabled = (settings: LoadedSettings): boolean => {
  if (settings.merged.ui?.useAlternateBuffer !== undefined) {
    return settings.merged.ui.useAlternateBuffer;
  }
  // Default to true for Warp Terminal to ensure correct focus/input handling
  if (process.env['TERM_PROGRAM'] === 'WarpTerminal') {
    return true;
  }
  return false;
};

export const useAlternateBuffer = (): boolean => {
  const settings = useSettings();
  return isAlternateBufferEnabled(settings);
};
