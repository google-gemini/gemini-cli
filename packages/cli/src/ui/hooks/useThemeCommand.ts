/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { themeManager } from '../themes/theme-manager.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js'; // Import LoadedSettings, AppSettings, MergedSetting
import { type HistoryItem, MessageType } from '../types.js';
import { CustomTheme } from '../themes/theme.js';
import process from 'node:process';

interface UseThemeCommandReturn {
  isThemeDialogOpen: boolean;
  openThemeDialog: () => void;
  handleThemeSelect: (
    themeName: string | undefined,
    scope: SettingScope,
  ) => void; // Added scope
  handleThemeHighlight: (themeName: string | undefined) => void;
  handleCustomThemeSave: (customTheme: CustomTheme, scope: SettingScope) => void;
  handleCustomThemeDelete: (themeName: string, scope: SettingScope) => void;
}

export const useThemeCommand = (
  loadedSettings: LoadedSettings,
  setThemeError: (error: string | null) => void,
  addItem: (item: Omit<HistoryItem, 'id'>, timestamp: number) => void,
): UseThemeCommandReturn => {
  // Determine the effective theme
  const effectiveTheme = loadedSettings.merged.theme;

  // Initial state: Open dialog if no theme is set in either user or workspace settings
  const [isThemeDialogOpen, setIsThemeDialogOpen] = useState(
    effectiveTheme === undefined && !process.env.NO_COLOR,
  );
  // TODO: refactor how theme's are accessed to avoid requiring a forced render.
  const [, setForceRender] = useState(0);

  // Apply initial theme on component mount
  useEffect(() => {
    if (effectiveTheme === undefined) {
      if (process.env.NO_COLOR) {
        addItem(
          {
            type: MessageType.INFO,
            text: 'Theme configuration unavailable due to NO_COLOR env variable.',
          },
          Date.now(),
        );
      }
      // If no theme is set and NO_COLOR is not set, the dialog is already open.
      return;
    }

    if (!themeManager.setActiveTheme(effectiveTheme)) {
      setIsThemeDialogOpen(true);
      setThemeError(`Theme "${effectiveTheme}" not found.`);
    } else {
      setThemeError(null);
    }
  }, [effectiveTheme, setThemeError, addItem]); // Re-run if effectiveTheme or setThemeError changes

  const openThemeDialog = useCallback(() => {
    if (process.env.NO_COLOR) {
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
        setForceRender((v) => v + 1); // Trigger potential re-render
        setThemeError(null); // Clear any previous theme error on success
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

  const handleCustomThemeSave = useCallback(
    (customTheme: CustomTheme, scope: SettingScope) => {
      try {
        // Register the custom theme in the theme manager
        if (!themeManager.registerCustomTheme(customTheme)) {
          setThemeError(`Failed to register custom theme "${customTheme.name}"`);
          return;
        }

        // Save the custom theme to settings
        // Read from the specific scope being modified, not from merged settings
        const scopeSettings = loadedSettings.forScope(scope);
        const currentCustomThemes = scopeSettings.settings.customThemes || {};
        const updatedCustomThemes = {
          ...currentCustomThemes,
          [customTheme.name]: customTheme,
        };
        
        loadedSettings.setValue(scope, 'customThemes', updatedCustomThemes);
        
        // Set this as the active theme
        loadedSettings.setValue(scope, 'theme', customTheme.name);
        applyTheme(customTheme.name);
        
        addItem(
          {
            type: MessageType.INFO,
            text: `Custom theme "${customTheme.name}" saved and applied.`,
          },
          Date.now(),
        );
        
        setThemeError(null);
      } catch (error) {
        setThemeError(`Failed to save custom theme: ${error}`);
      }
    },
    [loadedSettings, applyTheme, addItem, setThemeError],
  );

  const handleCustomThemeDelete = useCallback(
    (themeName: string, scope: SettingScope) => {
      try {
        // Unregister the custom theme from the theme manager
        if (!themeManager.unregisterCustomTheme(themeName)) {
          setThemeError(`Failed to unregister custom theme "${themeName}"`);
          return;
        }

        // Remove the custom theme from settings
        // Read from the specific scope being modified, not from merged settings
        const scopeSettings = loadedSettings.forScope(scope);
        const currentCustomThemes = scopeSettings.settings.customThemes || {};
        const updatedCustomThemes = { ...currentCustomThemes };
        delete updatedCustomThemes[themeName];
        
        loadedSettings.setValue(scope, 'customThemes', updatedCustomThemes);
        
        // If this was the active theme, switch to default
        if (loadedSettings.merged.theme === themeName) {
          loadedSettings.setValue(scope, 'theme', undefined);
          applyTheme(undefined);
        }
        
        addItem(
          {
            type: MessageType.INFO,
            text: `Custom theme "${themeName}" deleted.`,
          },
          Date.now(),
        );
        
        setThemeError(null);
      } catch (error) {
        setThemeError(`Failed to delete custom theme: ${error}`);
      }
    },
    [loadedSettings, applyTheme, addItem, setThemeError],
  );

  return {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
    handleCustomThemeSave,
    handleCustomThemeDelete,
  };
};
