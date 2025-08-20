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
} from 'react';
import { LoadedSettings, SettingScope } from '../../config/settings.js';

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
  const initialVimEnabled = settings.merged.vimMode ?? false;
  const [vimEnabled, setVimEnabled] = useState(initialVimEnabled);
  const [vimMode, setVimMode] = useState<VimMode>(
    initialVimEnabled ? 'NORMAL' : 'INSERT',
  );

  useEffect(() => {
    // Initialize vimEnabled from settings on mount
    const enabled = settings.merged.vimMode ?? false;
    setVimEnabled(enabled);
    // When vim mode is enabled, always start in NORMAL mode
    if (enabled) {
      setVimMode('NORMAL');
    }
  }, [settings.merged.vimMode]);

  const toggleVimEnabled = useCallback(async () => {
    const newValue = !vimEnabled;
    setVimEnabled(newValue);
    // When enabling vim mode, start in NORMAL mode
    if (newValue) {
      setVimMode('NORMAL');
    }
    await settings.setValue(SettingScope.User, 'vimMode', newValue);
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
