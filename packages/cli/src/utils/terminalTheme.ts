/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type TerminalBackgroundColor,
  terminalCapabilityManager,
} from '../ui/utils/terminalCapabilityManager.js';
import { themeManager } from '../ui/themes/theme-manager.js';
import { DefaultLight } from '../ui/themes/default-light.js';
import { DefaultDark } from '../ui/themes/default.js';
import { getThemeTypeFromBackgroundColor } from '../ui/themes/color-utils.js';
import type { LoadedSettings, MergedSettings } from '../config/settings.js';
import { type Config, coreEvents, debugLogger } from '@google/gemini-cli-core';

export function getActiveThemeName(
  settings: MergedSettings,
  terminalBackgroundColor: TerminalBackgroundColor,
  cliTheme?: string,
  cliThemeMode?: 'light' | 'dark',
): string {
  if (cliTheme) {
    return cliTheme;
  }

  let mode = cliThemeMode;
  if (!mode && terminalBackgroundColor) {
    mode = getThemeTypeFromBackgroundColor(terminalBackgroundColor);
  }

  if (mode === 'light') {
    return settings.ui?.themeLight || DefaultLight.name;
  } else {
    // Default to dark
    return settings.ui?.themeDark || DefaultDark.name;
  }
}

/**
 * Detects terminal capabilities, loads themes, and sets the active theme.
 * @param config The application config.
 * @param settings The loaded settings.
 * @returns The detected terminal background color.
 */
export async function setupTerminalAndTheme(
  config: Config,
  settings: LoadedSettings,
): Promise<TerminalBackgroundColor> {
  let terminalBackground: TerminalBackgroundColor = undefined;
  if (config.isInteractive() && process.stdin.isTTY) {
    // Detect terminal capabilities (Kitty protocol, background color) in parallel.
    await terminalCapabilityManager.detectCapabilities();
    terminalBackground = terminalCapabilityManager.getTerminalBackgroundColor();
  }

  // Load custom themes from settings
  themeManager.loadCustomThemes(settings.merged.ui.customThemes);

  const activeThemeName = getActiveThemeName(
    settings.merged,
    terminalBackground,
    config.getCliTheme(),
    config.getCliThemeMode(),
  );

  if (!themeManager.setActiveTheme(activeThemeName)) {
    // If the theme is not found during initial load, log a warning and continue.
    // The useThemeCommand hook in AppContainer.tsx will handle opening the dialog.
    debugLogger.warn(`Warning: Theme "${activeThemeName}" not found.`);
  }

  config.setTerminalBackground(terminalBackground);
  themeManager.setTerminalBackground(terminalBackground);

  if (terminalBackground !== undefined) {
    const currentTheme = themeManager.getActiveTheme();
    if (!themeManager.isThemeCompatible(currentTheme, terminalBackground)) {
      const backgroundType =
        getThemeTypeFromBackgroundColor(terminalBackground);
      coreEvents.emitFeedback(
        'warning',
        `Theme '${currentTheme.name}' (${currentTheme.type}) might look incorrect on your ${backgroundType} terminal background. Type /theme to change theme.`,
      );
    }
  }

  return terminalBackground;
}
