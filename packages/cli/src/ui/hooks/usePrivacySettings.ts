/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import { type LoadedSettings, SettingScope } from '../../config/settings.js';

export interface PrivacySettings {
  usageStatisticsEnabled: boolean;
  setUsageStatisticsEnabled: (enabled: boolean, scope: SettingScope) => void;
}

export const usePrivacySettings = (
  settings: LoadedSettings,
): PrivacySettings => {
  const setUsageStatisticsEnabled = useCallback(
    (enabled: boolean, scope: SettingScope) => {
      // @ts-expect-error - setValue method has restrictive typing but supports boolean values
      settings.setValue(scope, 'usageStatisticsEnabled', enabled);
    },
    [settings],
  );

  return {
    usageStatisticsEnabled: settings.merged.usageStatisticsEnabled ?? true,
    setUsageStatisticsEnabled,
  };
};
