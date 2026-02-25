/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useConfig } from '../contexts/ConfigContext.js';
import type { LoadedSettings } from '../../config/settings.js';

export const isAlternateBufferEnabled = (settings: LoadedSettings): boolean =>
  settings.merged.ui.useAlternateBuffer === true;

// This is read from Config so that the UI reads the same value per application session
export const useAlternateBuffer = (): boolean => {
  const config = useConfig();
  return config.getUseAlternateBuffer();
};
