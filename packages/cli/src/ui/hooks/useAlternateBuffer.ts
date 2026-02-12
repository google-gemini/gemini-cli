/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSettings } from '../contexts/SettingsContext.js';
import type { LoadedSettings, MergedSettings } from '../../config/settings.js';

export const isAlternateBufferEnabled = (
  settings: LoadedSettings | MergedSettings,
): boolean => {
  const merged = 'merged' in settings ? settings.merged : settings;
  return merged.ui.useAlternateBuffer === true;
};

export const useAlternateBuffer = (): boolean => {
  const settings = useSettings();
  return isAlternateBufferEnabled(settings);
};
