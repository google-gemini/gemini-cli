/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AyuDark } from './ayu.js';
import { AyuLight } from './ayu-light.js';
import { AtomOneDark } from './atom-one-dark.js';
import { Dracula } from './dracula.js';
import { GitHubDark } from './github-dark.js';
import { GitHubLight } from './github-light.js';
import { GoogleCode } from './googlecode.js';
import { DefaultLight } from './default-light.js';
import { DefaultDark } from './default.js';
import { ShadesOfPurple } from './shades-of-purple.js';
import { XCode } from './xcode.js';
import {
  Theme,
  ThemeType,
  CustomTheme,
  createCustomTheme,
  validateCustomTheme,
} from './theme.js';
import { SemanticColors } from './semantic-tokens.js';
import { ANSI } from './ansi.js';
import { ANSILight } from './ansi-light.js';
import { NoColorTheme } from './no-color.js';
import process from 'node:process';

export interface ThemeDisplay {
  name: string;
  type: ThemeType;
  isCustom?: boolean;
}

export const DEFAULT_THEME: Theme = DefaultDark;

class ThemeManager {
  private readonly availableThemes: Theme[];
  private activeTheme: Theme;
  private customThemes: Map<string, Theme> = new Map();

  constructor() {
    this.availableThemes = [
      AyuDark,
      AyuLight,
      AtomOneDark,
      Dracula,
      DefaultLight,
      DefaultDark,
      GitHubDark,
      GitHubLight,
      GoogleCode,
      ShadesOfPurple,
      XCode,
      ANSI,
      ANSILight,
    ];
    this.activeTheme = DEFAULT_THEME;
  }

  /**
   * Loads custom themes from settings.
   * @param customThemesSettings Custom themes from settings.
   */
  loadCustomThemes(customThemesSettings?: Record<string, CustomTheme>): void {
    this.customThemes.clear();

    if (!customThemesSettings) {
      return;
    }

    for (const [name, customThemeConfig] of Object.entries(
      customThemesSettings,
    )) {
      const validation = validateCustomTheme(customThemeConfig);
      if (validation.isValid) {
        if (validation.warning) {
          console.warn(`Theme "${name}": ${validation.warning}`);
        }
        const themeWithDefaults: CustomTheme = {
          ...DEFAULT_THEME.colors,
          ...customThemeConfig,
          name: customThemeConfig.name || name,
          type: 'custom',
        };

        try {
          const theme = createCustomTheme(themeWithDefaults);
          this.customThemes.set(name, theme);
        } catch (error) {
          console.warn(`Failed to load custom theme "${name}":`, error);
        }
      } else {
        console.warn(`Invalid custom theme "${name}": ${validation.error}`);
      }
    }
    // If the current active theme is a custom theme, keep it if still valid
    if (
      this.activeTheme &&
      this.activeTheme.type === 'custom' &&
      this.customThemes.has(this.activeTheme.name)
    ) {
      this.activeTheme = this.customThemes.get(this.activeTheme.name)!;
    }
  }

  /**
   * Sets the active theme.
   * @param themeName The name of the theme to set as active.
   * @returns True if the theme was successfully set, false otherwise.
   */
  setActiveTheme(themeName: string | undefined): boolean {
    const theme = this.findThemeByName(themeName);
    if (!theme) {
      return false;
    }
    this.activeTheme = theme;
    return true;
  }

  /**
   * Gets the currently active theme.
   * @returns The active theme.
   */
  getActiveTheme(): Theme {
    if (process.env['NO_COLOR']) {
      return NoColorTheme;
    }
    // Ensure the active theme is always valid (fall back to default if not)
    if (!this.activeTheme || !this.findThemeByName(this.activeTheme.name)) {
      this.activeTheme = DEFAULT_THEME;
    }
    return this.activeTheme;
  }

  /**
   * Gets the semantic colors for the active theme.
   * @returns The semantic colors.
   */
  getSemanticColors(): SemanticColors {
    return this.getActiveTheme().semanticColors;
  }

  /**
   * Gets a list of custom theme names.
   * @returns Array of custom theme names.
   */
  getCustomThemeNames(): string[] {
    return Array.from(this.customThemes.keys());
  }

  /**
   * Checks if a theme name is a custom theme.
   * @param themeName The theme name to check.
   * @returns True if the theme is custom.
   */
  isCustomTheme(themeName: string): boolean {
    return this.customThemes.has(themeName);
  }

  /**
   * Returns a list of available theme names.
   */
  getAvailableThemes(): ThemeDisplay[] {
    const builtInThemes = this.availableThemes.map((theme) => ({
      name: theme.name,
      type: theme.type,
      isCustom: false,
    }));

    const customThemes = Array.from(this.customThemes.values()).map(
      (theme) => ({
        name: theme.name,
        type: theme.type,
        isCustom: true,
      }),
    );

    const allThemes = [...builtInThemes, ...customThemes];

    const sortedThemes = allThemes.sort((a, b) => {
      const typeOrder = (type: ThemeType): number => {
        switch (type) {
          case 'dark':
            return 1;
          case 'light':
            return 2;
          case 'ansi':
            return 3;
          case 'custom':
            return 4; // Custom themes at the end
          default:
            return 5;
        }
      };

      const typeComparison = typeOrder(a.type) - typeOrder(b.type);
      if (typeComparison !== 0) {
        return typeComparison;
      }
      return a.name.localeCompare(b.name);
    });

    return sortedThemes;
  }

  /**
   * Gets a theme by name.
   * @param themeName The name of the theme to get.
   * @returns The theme if found, undefined otherwise.
   */
  getTheme(themeName: string): Theme | undefined {
    return this.findThemeByName(themeName);
  }

  findThemeByName(themeName: string | undefined): Theme | undefined {
    if (!themeName) {
      return DEFAULT_THEME;
    }

    // First check built-in themes
    const builtInTheme = this.availableThemes.find(
      (theme) => theme.name === themeName,
    );
    if (builtInTheme) {
      return builtInTheme;
    }

    // Then check custom themes
    return this.customThemes.get(themeName);
  }
}

// Export an instance of the ThemeManager
export const themeManager = new ThemeManager();
