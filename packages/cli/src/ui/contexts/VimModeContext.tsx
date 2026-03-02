/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useCallback, useContext, useState } from 'react';
import { SettingScope } from '../../config/settings.js';
import { useSettingsStore } from './SettingsContext.js';

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
}: {
  children: React.ReactNode;
}) => {
  const { settings, setSetting } = useSettingsStore();
  const vimEnabled = settings.merged.general.vimMode;
  const [vimMode, setVimMode] = useState<VimMode>('INSERT');

  const toggleVimEnabled = useCallback(async () => {
    const newValue = !vimEnabled;
    // When enabling vim mode, start in INSERT mode
    if (newValue) {
      setVimMode('INSERT');
    }
    setSetting(SettingScope.User, 'general.vimMode', newValue);
    return newValue;
  }, [vimEnabled, setSetting]);

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
