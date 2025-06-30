/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { Config } from '@google/gemini-cli-core';

export interface PrivacyState {
  isLoading: boolean;
  error: string | null;
  isFreeTier: boolean | null;
  dataCollectionOptIn: boolean;
}

export interface PrivacySettings {
  privacyState: PrivacyState;
  updateDataCollectionOptIn: (enabled: boolean) => void;
}

export const usePrivacySettings = (config: Config): PrivacySettings => {
  const [privacyState, setPrivacyState] = useState<PrivacyState>({
    isLoading: false,
    error: null,
    isFreeTier: true, // Default to free tier
    dataCollectionOptIn: true, // Default to enabled
  });

  const updateDataCollectionOptIn = useCallback((enabled: boolean) => {
    setPrivacyState(prev => ({
      ...prev,
      dataCollectionOptIn: enabled,
    }));
  }, []);

  return {
    privacyState,
    updateDataCollectionOptIn,
  };
}; 