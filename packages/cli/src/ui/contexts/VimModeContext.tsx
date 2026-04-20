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
import { SettingScope } from '../../config/settings.js';
import { useSettingsStore } from './SettingsContext.js';
import {
  setCursorBlock,
  setCursorBar,
  resetCursorShape,
} from '../utils/vimCursorShape.js';

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
  const [vimMode, setVimModeState] = useState<VimMode>('INSERT');

  // Wrap setVimMode to also update terminal cursor shape
  const setVimMode = useCallback(
    (mode: VimMode) => {
      setVimModeState(mode);
      if (vimEnabled) {
        if (mode === 'NORMAL') {
          setCursorBlock();
        } else {
          setCursorBar();
        }
      }
    },
    [vimEnabled],
  );

  const toggleVimEnabled = useCallback(async () => {
    const newValue = !vimEnabled;
    // When enabling vim mode, start in INSERT mode
    if (newValue) {
      setVimModeState('INSERT');
      setCursorBar();
    } else {
      // When disabling vim mode, reset cursor to terminal default
      resetCursorShape();
    }
    setSetting(SettingScope.User, 'general.vimMode', newValue);
    return newValue;
  }, [vimEnabled, setSetting]);

  // Reset cursor shape when the provider unmounts (app exit)
  useEffect(
    () => () => {
      resetCursorShape();
    },
    [],
  );

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
