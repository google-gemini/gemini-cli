/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { themeManager } from '../themes/theme-manager.js';
import type { LoadedSettings, SettingScope } from '../../config/settings.js'; // Import LoadedSettings, AppSettings, MergedSetting
import { type HistoryItem, MessageType } from '../types.js';
import process from 'node:process';

interface UseThemeCommandReturn {
  isThemeDialogOpen: boolean;
  openThemeDialog: () => void;
  handleThemeSelect: (
    themeName: string | undefined,
    scope: SettingScope,
  ) => Promise<void>; // Now returns Promise<void>
  handleThemeHighlight: (themeName: string | undefined) => void;
}

export const useThemeCommand = (
  loadedSettings: LoadedSettings,
  setThemeError: (error: string | null) => void,
  addItem: (item: Omit<HistoryItem, 'id'>, timestamp: number) => void,
): UseThemeCommandReturn => {
  const [isThemeDialogOpen, setIsThemeDialogOpen] = useState(false);

  // Load custom themes and apply configured theme on startup
  useEffect(() => {
    const loadThemesAndApply = async () => {
      try {
        // First, load custom themes from both settings and files
        if (loadedSettings.merged.customThemes) {
          await themeManager.loadCustomThemes(
            loadedSettings.merged.customThemes,
          );
        }

        // Then, apply the configured theme if it exists and is valid
        const effectiveTheme = loadedSettings.merged.theme;
        if (effectiveTheme) {
          if (themeManager.findThemeByName(effectiveTheme)) {
            themeManager.setActiveTheme(effectiveTheme);
            setThemeError(null);
          } else {
            setIsThemeDialogOpen(true);
            setThemeError(`Theme "${effectiveTheme}" not found.`);
          }
        } else {
          setThemeError(null);
        }
      } catch (error) {
        console.warn('Failed to load custom themes on startup:', error);
      }
    };

    loadThemesAndApply();
  }, [
    loadedSettings.merged.customThemes,
    loadedSettings.merged.theme,
    setThemeError,
  ]);
    const effectiveTheme = loadedSettings.merged.ui?.theme;
    if (effectiveTheme && !themeManager.findThemeByName(effectiveTheme)) {
      setIsThemeDialogOpen(true);
      setThemeError(`Theme "${effectiveTheme}" not found.`);
    } else {
      setThemeError(null);
    }
  }, [loadedSettings.merged.ui?.theme, setThemeError]);
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
    async (themeName: string | undefined, scope: SettingScope) => {
      try {
        // Cancel selection: do not persist and just close dialog after restoring via preview logic
        if (themeName === undefined) {
          setIsThemeDialogOpen(false);
          return;
        }

        // Validate against full catalog (built-in + merged + file-based already loaded into themeManager)
        const exists = !!themeManager.findThemeByName(themeName);
        if (!exists) {
          setThemeError(`Theme "${themeName}" not found.`);
          setIsThemeDialogOpen(true);
          return;
        }

        // Persist theme name at the chosen scope
        loadedSettings.setValue(scope, 'theme', themeName);

        // Ensure themeManager has combined latest before applying (idempotent safe)
        if (loadedSettings.merged.customThemes) {
          await themeManager.loadCustomThemes(
            loadedSettings.merged.customThemes,
          );
        }
        applyTheme(loadedSettings.merged.theme);
        // Merge user and workspace custom themes (workspace takes precedence)
        const mergedCustomThemes = {
          ...(loadedSettings.user.settings.ui?.customThemes || {}),
          ...(loadedSettings.workspace.settings.ui?.customThemes || {}),
        };
        // Only allow selecting themes available in the merged custom themes or built-in themes
        const isBuiltIn = themeManager.findThemeByName(themeName);
        const isCustom = themeName && mergedCustomThemes[themeName];
        if (!isBuiltIn && !isCustom) {
          setThemeError(`Theme "${themeName}" not found in selected scope.`);
          setIsThemeDialogOpen(true);
          return;
        }
        loadedSettings.setValue(scope, 'ui.theme', themeName); // Update the merged settings
        if (loadedSettings.merged.ui?.customThemes) {
          themeManager.loadCustomThemes(loadedSettings.merged.ui?.customThemes);
        }
        applyTheme(loadedSettings.merged.ui?.theme); // Apply the current theme
        setThemeError(null);
      } catch (error) {
        console.warn('Failed to load custom themes:', error);
        setThemeError('Failed to load custom themes');
      } finally {
        setIsThemeDialogOpen(false);
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
