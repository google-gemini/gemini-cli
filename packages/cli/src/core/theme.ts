/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { themeManager } from '../ui/themes/theme-manager.js';
import { type LoadedSettings } from '../config/settings.js';
import { AUTO_THEME } from '../ui/themes/theme.js';

/**
 * Validates the configured theme.
 * @param settings The loaded application settings.
 * @returns An error message if the theme is not found, otherwise null.
 */
export function validateTheme(settings: LoadedSettings): string | null {
  const effectiveTheme = settings.merged.ui?.theme;
  // AUTO_THEME is a special theme value that gets resolved at runtime
  if (effectiveTheme === AUTO_THEME) {
    return null;
  }
  if (effectiveTheme && !themeManager.findThemeByName(effectiveTheme)) {
    return `Theme "${effectiveTheme}" not found.`;
  }
  return null;
}
