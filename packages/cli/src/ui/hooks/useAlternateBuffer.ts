/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSettings } from '../contexts/SettingsContext.js';

export const useAlternateBuffer = (): boolean => {
  const settings = useSettings();
  return settings.merged.ui?.useAlternateBuffer ?? false;
};
