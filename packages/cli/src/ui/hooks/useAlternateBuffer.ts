/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useConfig } from '../contexts/ConfigContext.js';
import type { LoadedSettings } from '../../config/settings.js';

/**
 * Check if alternate buffer is enabled from settings (for startup-time checks).
 * This reads directly from settings.merged and is used before React renders.
 */
export const isAlternateBufferEnabled = (settings: LoadedSettings): boolean =>
  settings.merged.ui.useAlternateBuffer === true;

/**
 * React hook to check if alternate buffer mode is enabled.
 * Returns the immutable session value from Config, not the reactive settings value.
 * This ensures UI components reflect the actual terminal buffer mode.
 */
export const useAlternateBuffer = (): boolean => {
  const config = useConfig();
  return config.getUseAlternateBuffer();
};
