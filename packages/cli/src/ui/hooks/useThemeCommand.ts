/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useContext } from 'react';
import { themeManager } from '../themes/theme-manager.js';
import { HistoryItem, MessageType } from '../types.js';
import { SettingScope } from '../../config/settings.js';
import { SettingsContext } from '../contexts/SettingsContext.js';
import process from 'node:process';

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
  setThemeError: (error: string | null) => void,
  addItem: (item: Omit<HistoryItem, 'id'>, timestamp: number) => void,
): UseThemeCommandReturn => {
  const [isThemeDialogOpen, setIsThemeDialogOpen] = useState(false);
  const settingsContext = useContext(SettingsContext);
  const loadedSettings = settingsContext!.settings;

  // Check for invalid theme configuration on startup
  useEffect(() => {
    const effectiveTheme = loadedSettings.merged.theme;
    if (effectiveTheme && !themeManager.findThemeByName(effectiveTheme)) {
      setIsThemeDialogOpen(true);
      setThemeError(`Theme "${effectiveTheme}" not found.`);
    } else {
      setThemeError(null);
    }
  }, [loadedSettings.merged.theme, setThemeError]);

  const openThemeDialog = useCallback(() => {
    if (process.env['NO_COLOR']) {
      addItem(
        {
          type: MessageType.INFO,
          text: 'Theme configuration unavailable due to NO_COLOR env variable.',
        },
        Date.now(),
      );
      return;
    }
    setIsThemeDialogOpen(true);
  }, [addItem]);

  const applyTheme = useCallback(
    (themeName: string | undefined) => {
      if (!themeManager.setActiveTheme(themeName)) {
        // If theme is not found, open the theme selection dialog and set error message
        setIsThemeDialogOpen(true);
        setThemeError(`Theme "${themeName}" not found.`);
      } else {
        setThemeError(null); // Clear any previous theme error on success
      }
    },
    [setThemeError],
  );

  const handleThemeHighlight = useCallback(
    (themeName: string | undefined) => {
      applyTheme(themeName);
    },
    [applyTheme],
  );

  const handleThemeSelect = useCallback(
    (themeName: string | undefined, scope: SettingScope) => {
      try {
        // Merge user and workspace custom themes (workspace takes precedence)
        const mergedCustomThemes = {
          ...(loadedSettings.user.settings.customThemes || {}),
          ...(loadedSettings.workspace.settings.customThemes || {}),
        };
        // Only allow selecting themes available in the merged custom themes or built-in themes
        const isBuiltIn = themeManager.findThemeByName(themeName);
        const isCustom = themeName && mergedCustomThemes[themeName];
        if (!isBuiltIn && !isCustom) {
          setThemeError(`Theme "${themeName}" not found in selected scope.`);
          setIsThemeDialogOpen(true);
          return;
        }
        loadedSettings.setValue(scope, 'theme', themeName); // Update the merged settings
        if (loadedSettings.merged.customThemes) {
          themeManager.loadCustomThemes(loadedSettings.merged.customThemes);
        }
        applyTheme(loadedSettings.merged.theme); // Apply the current theme
        setThemeError(null);
      } finally {
        setIsThemeDialogOpen(false); // Close the dialog
      }
    },
    [applyTheme, loadedSettings, setThemeError],
  );

  return {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  };
};
