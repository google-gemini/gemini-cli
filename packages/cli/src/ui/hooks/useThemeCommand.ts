/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { themeManager } from '../themes/theme-manager.js';

interface UseThemeCommandReturn {
  isThemeDialogOpen: boolean;
  openThemeDialog: () => void;
  handleThemeSelect: (themeName: string) => void;
}

export const useThemeCommand = (): UseThemeCommandReturn => {
  const [isThemeDialogOpen, setIsThemeDialogOpen] = useState(false);
  const [, setForceRender] = useState(0);

  const openThemeDialog = useCallback(() => {
    setIsThemeDialogOpen(true);
  }, []);

  const handleThemeSelect = useCallback((themeName: string) => {
    try {
      themeManager.setActiveTheme(themeName);
      setForceRender((v) => v + 1); // Trigger potential re-render
    } catch (error) {
      console.error(`Error setting theme: ${error}`);
    } finally {
      setIsThemeDialogOpen(false); // Close the dialog
    }
  }, []);

  return {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
  };
};
