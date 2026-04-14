/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import { useVimCursorShape } from '../hooks/useVimCursorShape.js';

export type VimMode = 'NORMAL' | 'INSERT';

interface VimModeContextType {
  vimEnabled: boolean;
  vimMode: VimMode;
  toggleVimEnabled: () => Promise<boolean>;
  setVimMode: (mode: VimMode) => void;
}

const VimModeContext = createContext<VimModeContextType | undefined>(undefined);

export const VimModeProvider = ({
  children,
  settings,
}: {
  children: React.ReactNode;
  settings: LoadedSettings;
}) => {
  const settingsSnapshot = useSyncExternalStore(
    (listener) => settings.subscribe(listener),
    () => settings.getSnapshot(),
  );
  const generalSettings = settingsSnapshot.merged.general;
  const initialVimEnabled = generalSettings.vimMode;
  const [vimEnabled, setVimEnabled] = useState(initialVimEnabled);
  const [vimMode, setVimMode] = useState<VimMode>('INSERT');

  useVimCursorShape({
    enabled: generalSettings.vimModeCursorShape,
    vimEnabled,
    vimMode,
  });

  useEffect(() => {
    // Initialize vimEnabled from settings on mount
    const enabled = generalSettings.vimMode;
    setVimEnabled(enabled);
    // When vim mode is enabled, start in INSERT mode
    if (enabled) {
      setVimMode('INSERT');
    }
  }, [generalSettings.vimMode]);

  const toggleVimEnabled = useCallback(async () => {
    const newValue = !vimEnabled;
    setVimEnabled(newValue);
    // When enabling vim mode, start in INSERT mode
    if (newValue) {
      setVimMode('INSERT');
    }
    settings.setValue(SettingScope.User, 'general.vimMode', newValue);
    return newValue;
  }, [vimEnabled, settings]);

  const value = {
    vimEnabled,
    vimMode,
    toggleVimEnabled,
    setVimMode,
  };

  return (
    <VimModeContext.Provider value={value}>{children}</VimModeContext.Provider>
  );
};

export const useVimMode = () => {
  const context = useContext(VimModeContext);
  if (context === undefined) {
    throw new Error('useVimMode must be used within a VimModeProvider');
  }
  return context;
};
