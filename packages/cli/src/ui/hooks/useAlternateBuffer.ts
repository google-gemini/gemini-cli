/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSettings } from '../contexts/SettingsContext.js';
import type { LoadedSettings } from '../../config/settings.js';

export const isAlternateBufferEnabled = (settings: LoadedSettings): boolean =>
  settings.merged.ui.useAlternateBuffer === true;

export const useAlternateBuffer = (): boolean => {
  const settings = useSettings();
  return isAlternateBufferEnabled(settings);
};
