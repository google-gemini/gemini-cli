/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { themeManager } from '../themes/theme-manager.js';
import type { LoadedSettings, SettingScope } from '../../config/settings.js';
import { type HistoryItem, MessageType } from '../types.js';
import process from 'node:process';

interface UseThemeCommandReturn {
  isThemeDialogOpen: boolean;
  openThemeDialog: () => void;
  handleThemeSelect: (
    themeName: string | undefined,
    scope: SettingScope,
  ) => Promise<void>;
  handleThemeHighlight: (themeName: string | undefined) => void;
}

export const useThemeCommand = (
  loadedSettings: LoadedSettings,
  setThemeError: (error: string | null) => void,
  addItem: (item: Omit<HistoryItem, 'id'>, timestamp: number) => void,
  initialThemeError: string | null,
): UseThemeCommandReturn => {
  // Initialize from main (if there was an initial error, dialog starts open)
  const [isThemeDialogOpen, setIsThemeDialogOpen] =
    useState<boolean>(!!initialThemeError);

  // On startup: load any custom themes and try to apply the configured theme
  useEffect(() => {
    let cancelled = false;

    const loadThemesAndApply = async () => {
      try {
        const customThemes = loadedSettings.merged.ui?.customThemes ?? {};
        if (Object.keys(customThemes).length) {
          await themeManager.loadCustomThemes(customThemes);
        }

        const effectiveTheme = loadedSettings.merged.ui?.theme;
        if (!effectiveTheme) {
          if (!cancelled) setThemeError(null);
          return;
        }

        if (themeManager.findThemeByName(effectiveTheme)) {
          themeManager.setActiveTheme(effectiveTheme);
          if (!cancelled) setThemeError(null);
        } else {
          if (!cancelled) {
            setThemeError(`Theme "${effectiveTheme}" not found.`);
            setIsThemeDialogOpen(true);
          }
        }
      } catch (error) {
        console.warn('Failed to load/apply theme on startup:', error);
        if (!cancelled) {
          setThemeError('Failed to load or apply theme.');
          setIsThemeDialogOpen(true);
        }
      }
    };

    loadThemesAndApply();
    return () => {
      cancelled = true;
    };
  }, [loadedSettings.merged.ui?.customThemes, loadedSettings.merged.ui?.theme, setThemeError]);

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
      // If undefined, do nothing; selection flow will handle closing/clearing
      if (!themeName) return;

      if (!themeManager.setActiveTheme(themeName)) {
        setIsThemeDialogOpen(true);
        setThemeError(`Theme "${themeName}" not found.`);
      } else {
        setThemeError(null);
      }
    },
    [setThemeError],
  );

  const handleThemeHighlight = useCallback(
    (themeName: string | undefined) => {
      // Preview on hover/focus
      applyTheme(themeName);
    },
    [applyTheme],
  );

  const handleThemeSelect = useCallback(
    async (themeName: string | undefined, scope: SettingScope) => {
      try {
        // Cancel: close dialog (preview already reverted by UI logic, if any)
        if (themeName === undefined) {
          setIsThemeDialogOpen(false);
          return;
        }

        // Validate candidate against full catalog
        if (!themeManager.findThemeByName(themeName)) {
          setThemeError(`Theme "${themeName}" not found.`);
          setIsThemeDialogOpen(true);
          return;
        }

        // Persist at the chosen scope (normalize to the same key everywhere)
        loadedSettings.setValue(scope, 'ui.theme', themeName);

        // Ensure latest custom themes are (re)loaded before the apply
        const customThemes = loadedSettings.merged.ui?.customThemes ?? {};
        if (Object.keys(customThemes).length) {
          await themeManager.loadCustomThemes(customThemes);
        }

        // Apply the final effective theme from merged settings
        applyTheme(loadedSettings.merged.ui?.theme);

        setThemeError(null);
      } catch (error) {
        console.warn('Failed to persist/apply theme:', error);
        setThemeError('Failed to load custom themes');
        setIsThemeDialogOpen(true);
        return;
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