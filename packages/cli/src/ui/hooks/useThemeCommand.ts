/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
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
  loadedSettings: LoadedSettings,
  setThemeError: (error: string | null) => void,
): UseThemeCommandReturn => {
  // Determine the effective theme
  const effectiveTheme = loadedSettings.merged.theme;

  // Initial state: Open dialog if no theme is set in either user or workspace settings
  const [isThemeDialogOpen, setIsThemeDialogOpen] = useState(false);
  // TODO: refactor how theme's are accessed to avoid requiring a forced render.
  const [, setForceRender] = useState(0);

  // Apply initial theme on component mount
  useEffect(() => {
    try {
      themeManager.setActiveTheme(effectiveTheme);
      setThemeError(null); // Clear any previous theme error on success
    } catch (error: unknown) {
      // If theme is not found during initial load, open the theme selection dialog and set error message
      if (
        error instanceof Error &&
        error.message.includes('Theme') &&
        error.message.includes('not found')
      ) {
        setIsThemeDialogOpen(true);
        setThemeError(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      } else {
        console.error(
          `Error setting initial theme: ${error instanceof Error ? error.message : String(error)}`,
        );
        setThemeError(
          `Error setting initial theme: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }, [effectiveTheme, setThemeError]); // Re-run if effectiveTheme or setThemeError changes

  const openThemeDialog = useCallback(() => {
    setIsThemeDialogOpen(true);
  }, []);

  const applyTheme = useCallback(
    (themeName: string | undefined) => {
      try {
        themeManager.setActiveTheme(themeName);
        setForceRender((v) => v + 1); // Trigger potential re-render
        setThemeError(null); // Clear any previous theme error on success
      } catch (error: unknown) {
        // If theme is not found, open the theme selection dialog and set error message
        if (
          error instanceof Error &&
          error.message.includes('Theme') &&
          error.message.includes('not found')
        ) {
          setIsThemeDialogOpen(true);
          setThemeError(
            `Error: ${error instanceof Error ? error.message : String(error)}`,
          );
        } else {
          console.error(
            `Error setting theme: ${error instanceof Error ? error.message : String(error)}`,
          );
          setThemeError(
            `Error setting theme: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    },
    [setForceRender, setThemeError],
  );

  const handleThemeHighlight = useCallback(
    (themeName: string | undefined) => {
      applyTheme(themeName);
    },
    [applyTheme],
  );

  const handleThemeSelect = useCallback(
    (themeName: string | undefined, scope: SettingScope) => {
      // Added scope parameter
      try {
        loadedSettings.setValue(scope, 'theme', themeName); // Update the merged settings
        applyTheme(loadedSettings.merged.theme); // Apply the current theme
      } finally {
        setIsThemeDialogOpen(false); // Close the dialog
      }
    },
    [applyTheme, loadedSettings],
  );

  return {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  };
};
