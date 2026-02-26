/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { themeManager } from '../themes/theme-manager.js';
import type {
  LoadableSettingScope,
  LoadedSettings,
} from '../../config/settings.js'; // Import LoadedSettings, AppSettings, MergedSetting
import { MessageType } from '../types.js';
import process from 'node:process';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { useTerminalContext } from '../contexts/TerminalContext.js';

import { getActiveThemeName } from '../../utils/terminalTheme.js';
import type { Config } from '@google/gemini-cli-core';

interface UseThemeCommandReturn {
  isThemeDialogOpen: boolean;
  openThemeDialog: () => void;
  closeThemeDialog: () => void;
  handleThemeSelect: (
    themeName: string,
    scope: LoadableSettingScope,
    themeMode?: 'light' | 'dark',
  ) => Promise<void>;
  handleThemeHighlight: (themeName: string | undefined) => void;
}

export const useThemeCommand = (
  loadedSettings: LoadedSettings,
  setThemeError: (error: string | null) => void,
  addItem: UseHistoryManagerReturn['addItem'],
  initialThemeError: string | null,
  refreshStatic: () => void,
  config: Config,
): UseThemeCommandReturn => {
  const [isThemeDialogOpen, setIsThemeDialogOpen] =
    useState(!!initialThemeError);
  const { queryTerminalBackground } = useTerminalContext();

  const openThemeDialog = useCallback(async () => {
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

    // Ensure we have an up to date terminal background color when opening the
    // theme dialog as the user may have just changed it before opening the
    // dialog.
    await queryTerminalBackground();

    setIsThemeDialogOpen(true);
  }, [addItem, queryTerminalBackground]);

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

  const closeThemeDialog = useCallback(() => {
    // Re-apply the saved theme to revert any preview changes from highlighting
    const activeTheme = getActiveThemeName(
      loadedSettings.merged,
      config.getTerminalBackground(),
      config.getCliTheme(),
      config.getCliThemeMode(),
    );
    applyTheme(activeTheme);
    setIsThemeDialogOpen(false);
  }, [applyTheme, loadedSettings, config]);

  const handleThemeSelect = useCallback(
    async (
      themeName: string,
      scope: LoadableSettingScope,
      themeMode?: 'light' | 'dark',
    ) => {
      try {
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

        if (themeMode === 'light') {
          loadedSettings.setValue(scope, 'ui.themeLight', themeName);
        } else if (themeMode === 'dark') {
          loadedSettings.setValue(scope, 'ui.themeDark', themeName);
        } else {
          loadedSettings.setValue(scope, 'ui.themeLight', themeName);
          loadedSettings.setValue(scope, 'ui.themeDark', themeName);
        }

        if (loadedSettings.merged.ui.customThemes) {
          themeManager.loadCustomThemes(loadedSettings.merged.ui.customThemes);
        }

        const activeTheme = getActiveThemeName(
          loadedSettings.merged,
          config.getTerminalBackground(),
          config.getCliTheme(),
          config.getCliThemeMode(),
        );
        applyTheme(activeTheme);
        refreshStatic();
        setThemeError(null);
      } finally {
        setIsThemeDialogOpen(false); // Close the dialog
      }
    },
    [applyTheme, loadedSettings, refreshStatic, setThemeError, config],
  );

  return {
    isThemeDialogOpen,
    openThemeDialog,
    closeThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  };
};
