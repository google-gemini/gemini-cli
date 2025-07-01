/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { themeManager } from '../themes/theme-manager.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js'; // Import LoadedSettings, AppSettings, MergedSetting
import { type HistoryItem, MessageType } from '../types.js';
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
  loadedSettings: LoadedSettings,
  addItem: (item: HistoryItem, timestamp: number) => void,
  setThemeError: (error: string | null) => void,
): UseThemeCommandReturn => {
  const [isThemeDialogOpen, setIsThemeDialogOpen] = useState(false);

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
    setIsThemeDialogOpen(true);
  }, []);

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
        // If applying to user settings and the theme is a custom theme from workspace, copy its definition
        if (
          scope === SettingScope.User &&
          themeName &&
          loadedSettings.workspace.settings.customThemes?.[themeName] &&
          !loadedSettings.user.settings.customThemes?.[themeName]
        ) {
          const userCustomThemes = {
            ...(loadedSettings.user.settings.customThemes || {}),
          };
          userCustomThemes[themeName] =
            loadedSettings.workspace.settings.customThemes[themeName];
          loadedSettings.setValue(
            SettingScope.User,
            'customThemes',
            userCustomThemes,
          );
        }

        // If applying to workspace settings and the theme is a custom theme from user, copy its definition
        if (
          scope === SettingScope.Workspace &&
          themeName &&
          loadedSettings.user.settings.customThemes?.[themeName] &&
          !loadedSettings.workspace.settings.customThemes?.[themeName]
        ) {
          const workspaceCustomThemes = {
            ...(loadedSettings.workspace.settings.customThemes || {}),
          };
          workspaceCustomThemes[themeName] =
            loadedSettings.user.settings.customThemes[themeName];
          loadedSettings.setValue(
            SettingScope.Workspace,
            'customThemes',
            workspaceCustomThemes,
          );
        }

        loadedSettings.setValue(scope, 'theme', themeName); // Update the merged settings
        // If customThemes were updated, reload them
        if (loadedSettings.merged.customThemes) {
          themeManager.loadCustomThemes(loadedSettings.merged.customThemes);
        }
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
