/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { themeManager } from '../themes/theme-manager.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js'; // Import LoadedSettings, AppSettings, MergedSetting

interface UseThemeCommandReturn {
  isThemeDialogOpen: boolean;
  openThemeDialog: () => void;
  handleThemeSelect: (
    themeName: string | undefined,
    scope: SettingScope,
  ) => void; // Added scope
  handleThemeHighlight: (themeName: string | undefined) => void;
}

export const useThemeCommand = (
  loadedSettings: LoadedSettings, // Changed parameter
): UseThemeCommandReturn => {
  // Determine the effective theme
  const effectiveTheme = loadedSettings.getMerged().theme;

  // Initial state: Open dialog if no theme is set in either user or workspace settings
  const [isThemeDialogOpen, setIsThemeDialogOpen] = useState(
    effectiveTheme === undefined,
  );
  // TODO: refactor how theme's are accessed to avoid requiring a forced render.
  const [, setForceRender] = useState(0);

  const openThemeDialog = useCallback(() => {
    setIsThemeDialogOpen(true);
  }, []);

  function applyTheme(themeName: string | undefined) {
    try {
      themeManager.setActiveTheme(themeName);
      setForceRender((v) => v + 1); // Trigger potential re-render
    } catch (error) {
      console.error(`Error setting theme: ${error}`);
    }
  }

  const handleThemeHighlight = useCallback(
    (themeName: string | undefined) => {
      applyTheme(themeName);
    },
    [applyTheme],
  ); // Added applyTheme to dependencies

  const handleThemeSelect = useCallback(
    (themeName: string | undefined, scope: SettingScope) => {
      // Added scope parameter
      try {
        loadedSettings.setValue(scope, 'theme', themeName); // Update the merged settings
        applyTheme(loadedSettings.getMerged().theme); // Apply the current theme
      } finally {
        setIsThemeDialogOpen(false); // Close the dialog
      }
    },
    [applyTheme], // Added applyTheme to dependencies
  );

  return {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  };
};
