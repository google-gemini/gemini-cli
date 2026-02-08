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
  useMemo,
  useState,
} from 'react';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';

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
  const initialVimEnabled = settings.merged.general.vimMode;
  const [vimEnabled, setVimEnabled] = useState(initialVimEnabled);
  const [vimMode, setVimMode] = useState<VimMode>('INSERT');

  useEffect(() => {
    // Initialize vimEnabled from settings on mount
    const enabled = settings.merged.general.vimMode;
    setVimEnabled((prev) => {
      if (prev !== enabled) {
        return enabled;
      }
      return prev;
    });
    // When vim mode is enabled, start in INSERT mode
    if (enabled) {
      setVimMode((prev) => {
        if (prev !== 'INSERT') {
          return 'INSERT';
        }
        return prev;
      });
    }
  }, [settings.merged.general.vimMode]);

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

  // Memoize the context value to prevent unnecessary re-renders of consumers
  // (like useGeminiStream) which could otherwise trigger infinite loop warnings
  // when re-subscribing to events.
  const value = useMemo(
    () => ({
      vimEnabled,
      vimMode,
      toggleVimEnabled,
      setVimMode,
    }),
    [vimEnabled, vimMode, toggleVimEnabled, setVimMode],
  );

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
