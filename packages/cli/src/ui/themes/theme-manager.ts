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
import { Theme, ThemeType, CustomTheme, createCustomTheme, validateCustomTheme } from './theme.js';
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

    for (const [name, customThemeConfig] of Object.entries(customThemesSettings)) {
      const validation = validateCustomTheme(customThemeConfig);
      if (validation.isValid) {
        try {
          const theme = createCustomTheme(customThemeConfig);
          this.customThemes.set(name, theme);
        } catch (error) {
          console.warn(`Failed to load custom theme "${name}":`, error);
        }
      } else {
        console.warn(`Invalid custom theme "${name}": ${validation.error}`);
      }
    }
  }

  /**
   * Registers a custom theme.
   * @param customTheme The custom theme configuration.
   * @returns True if the theme was successfully registered, false otherwise.
   */
  registerCustomTheme(customTheme: CustomTheme): boolean {
    const validation = validateCustomTheme(customTheme);
    if (!validation.isValid) {
      console.error(`Invalid custom theme: ${validation.error}`);
      return false;
    }

    try {
      const theme = createCustomTheme(customTheme);
      this.customThemes.set(customTheme.name, theme);
      return true;
    } catch (error) {
      console.error(`Failed to register custom theme "${customTheme.name}":`, error);
      return false;
    }
  }

  /**
   * Unregisters a custom theme.
   * @param themeName The name of the custom theme to unregister.
   * @returns True if the theme was successfully unregistered, false otherwise.
   */
  unregisterCustomTheme(themeName: string): boolean {
    const wasRemoved = this.customThemes.delete(themeName);
    
    // If the active theme was removed, switch to default
    if (wasRemoved && this.activeTheme.name === themeName) {
      this.activeTheme = DEFAULT_THEME;
    }
    
    return wasRemoved;
  }

  /**
   * Updates a custom theme.
   * @param themeName The name of the custom theme to update.
   * @param customTheme The updated custom theme configuration.
   * @returns True if the theme was successfully updated, false otherwise.
   */
  updateCustomTheme(themeName: string, customTheme: CustomTheme): boolean {
    if (customTheme.name !== themeName) {
      console.error('Theme name mismatch in updateCustomTheme');
      return false;
    }

    const validation = validateCustomTheme(customTheme);
    if (!validation.isValid) {
      console.error(`Invalid custom theme: ${validation.error}`);
      return false;
    }

    try {
      const theme = createCustomTheme(customTheme);
      this.customThemes.set(themeName, theme);
      
      // If this is the active theme, update it
      if (this.activeTheme.name === themeName) {
        this.activeTheme = theme;
      }
      
      return true;
    } catch (error) {
      console.error(`Failed to update custom theme "${themeName}":`, error);
      return false;
    }
  }

  /**
   * Gets all custom theme names.
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

    const customThemes = Array.from(this.customThemes.values()).map((theme) => ({
      name: theme.name,
      type: theme.type,
      isCustom: true,
    }));

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
   * Sets the active theme.
   * @param themeName The name of the theme to activate.
   * @returns True if the theme was successfully set, false otherwise.
   */
  setActiveTheme(themeName: string | undefined): boolean {
    const foundTheme = this.findThemeByName(themeName);

    if (foundTheme) {
      this.activeTheme = foundTheme;
      return true;
    } else {
      // If themeName is undefined, it means we want to set the default theme.
      // If findThemeByName returns undefined (e.g. default theme is also not found for some reason)
      // then this will return false.
      if (themeName === undefined) {
        this.activeTheme = DEFAULT_THEME;
        return true;
      }
      return false;
    }
  }

  findThemeByName(themeName: string | undefined): Theme | undefined {
    if (!themeName) {
      return DEFAULT_THEME;
    }
    
    // First check built-in themes
    const builtInTheme = this.availableThemes.find((theme) => theme.name === themeName);
    if (builtInTheme) {
      return builtInTheme;
    }
    
    // Then check custom themes
    return this.customThemes.get(themeName);
  }

  /**
   * Returns the currently active theme object.
   */
  getActiveTheme(): Theme {
    if (process.env.NO_COLOR) {
      return NoColorTheme;
    }
    return this.activeTheme;
  }
}

// Export an instance of the ThemeManager
export const themeManager = new ThemeManager();
