/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSettings } from '../contexts/SettingsContext.js';

export const useScrollSettings = () => {
  const settings = useSettings();
  return {
    scrollAccelerationDuration:
      settings.merged.ui?.scrollAccelerationDuration ?? 1000,
    maxScrollSpeedFraction: settings.merged.ui?.maxScrollSpeedFraction ?? 0.4,
  };
};
