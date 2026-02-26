/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { themeManager } from '../ui/themes/theme-manager.js';
import { type LoadedSettings } from '../config/settings.js';

/**
 * Validates the configured theme.
 * @param settings The loaded application settings.
 * @returns An error message if the theme is not found, otherwise null.
 */
export function validateTheme(settings: LoadedSettings): string | null {
  const themeLight = settings.merged.ui.themeLight;
  if (themeLight && !themeManager.findThemeByName(themeLight)) {
    return `Theme "${themeLight}" not found.`;
  }
  const themeDark = settings.merged.ui.themeDark;
  if (themeDark && !themeManager.findThemeByName(themeDark)) {
    return `Theme "${themeDark}" not found.`;
  }
  return null;
}
