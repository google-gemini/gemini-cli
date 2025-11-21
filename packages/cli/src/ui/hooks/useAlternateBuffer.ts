/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSettings } from '../contexts/SettingsContext.js';
import type { LoadedSettings } from '../../config/settings.js';
import { shouldDisableAlternateBufferByDefault } from '../../utils/terminalEnvironment.js';

export const isAlternateBufferEnabled = (settings: LoadedSettings): boolean => {
  const useAlt = settings.merged.ui?.useAlternateBuffer !== false;
  const forceAlt = settings.merged.ui?.forceAlternateBuffer === true;

  if (!useAlt) return false;

  if (shouldDisableAlternateBufferByDefault()) {
    return forceAlt;
  }

  return true;
};

export const useAlternateBuffer = (): boolean => {
  const settings = useSettings();
  return isAlternateBufferEnabled(settings);
};
