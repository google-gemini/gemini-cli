/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import { LoadedSettings } from '../../config/settings.js';

export interface SettingsContextType {
  settings: LoadedSettings;
  recomputeSettings: () => void;
}

// This context is initialized in gemini.tsx with the loaded settings.
export const SettingsContext = createContext<SettingsContextType | null>(null);

export function useSettings(): LoadedSettings {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context.settings;
}
