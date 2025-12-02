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
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Theme, ThemeType, CustomTheme } from './theme.js';
import { createCustomTheme, validateCustomTheme } from './theme.js';
import type { SemanticColors } from './semantic-tokens.js';
import { ANSI } from './ansi.js';
import { ANSILight } from './ansi-light.js';
import { NoColorTheme } from './no-color.js';
import process from 'node:process';
import { debugLogger } from '@google/gemini-cli-core';

export interface ThemeDisplay {
  name: string;
  type: ThemeType;
  isCustom?: boolean;
}

export const DEFAULT_THEME: Theme = DefaultDark;

export class ThemeManager {
  private readonly availableThemes: Theme[];
  private activeTheme: Theme;
  private customThemes: Map<string, Theme> = new Map();
  private resolvedNameToTheme: Map<string, Theme> = new Map(); // Key: resolved theme name, Value: Theme object
  readonly themeFilePaths: Map<string, string> = new Map(); // Key: canonicalPath, Value: settings.json key

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
    this.resolvedNameToTheme.clear();
    this.themeFilePaths.clear();

    if (!customThemesSettings) {
      return;
    }

    for (const [key, customThemeConfig] of Object.entries(
      customThemesSettings,
    )) {
      // Check if it's a file-based theme
      if (customThemeConfig.path) {
        const invalidProperties = Object.keys(customThemeConfig).filter(
          (prop) => prop !== 'path' && prop !== 'name' && prop !== 'type',
        );
        if (invalidProperties.length > 0) {
          debugLogger.warn(
            `Theme "${key}": File-based themes (with "path") must not have other properties specified in settings.json. Ignoring: ${invalidProperties.join(', ')}.`,
          );
        }
        this.loadThemeFromFileWithKey(
          key,
          customThemeConfig.path,
          customThemeConfig,
        );
        continue;
      }

      // It's an inline theme
      const validation = validateCustomTheme(customThemeConfig);
      if (validation.isValid) {
        if (validation.warning) {
          debugLogger.warn(`Theme "${key}": ${validation.warning}`);
        }
        const themeWithDefaults: CustomTheme = {
          ...DEFAULT_THEME.colors,
          ...customThemeConfig,
          name: customThemeConfig.name || key,
          type: 'custom',
        };

        try {
          const theme = createCustomTheme(themeWithDefaults);
          this.customThemes.set(key, theme);
          this.resolvedNameToTheme.set(theme.name, theme); // Register by resolved name
        } catch (error) {
          debugLogger.warn(`Failed to load custom theme "${key}":`, error);
        }
      } else {
        debugLogger.warn(`Invalid custom theme "${key}": ${validation.error}`);
      }
    }
    // If the current active theme is a custom theme, keep it if still valid
    if (
      this.activeTheme &&
      this.activeTheme.type === 'custom' &&
      this.resolvedNameToTheme.has(this.activeTheme.name) // Check resolved name map
    ) {
      this.activeTheme = this.resolvedNameToTheme.get(this.activeTheme.name)!; // Retrieve from resolved name map
    }
  }

  private loadThemeFromFileWithKey(
    key: string,
    themePath: string,
    config: CustomTheme,
  ): void {
    try {
      const resolvedPath = path.resolve(themePath);
      // Check if file exists before trying to read
      if (!fs.existsSync(resolvedPath)) {
        debugLogger.warn(
          `Custom theme file not found for "${key}": "${themePath}" (resolved: "${resolvedPath}")`,
        );
        return;
      }

      const canonicalPath = fs.realpathSync(resolvedPath);

      // Security check
      const homeDir = path.resolve(os.homedir());
      if (!canonicalPath.startsWith(homeDir)) {
        debugLogger.warn(
          `Theme file at "${themePath}" is outside your home directory. ` +
            `Only load themes from trusted sources.`,
        );
        return;
      }

      const themeContent = fs.readFileSync(canonicalPath, 'utf-8');
      let fileThemeConfig: CustomTheme;
      try {
        fileThemeConfig = JSON.parse(themeContent) as CustomTheme;
      } catch (e) {
        debugLogger.warn(
          `Failed to parse JSON from theme file "${themePath}":`,
          e,
        );
        return;
      }

      const validation = validateCustomTheme(fileThemeConfig);
      if (!validation.isValid) {
        debugLogger.warn(
          `Invalid custom theme from file "${themePath}": ${validation.error}`,
        );
        return;
      }

      if (validation.warning) {
        debugLogger.warn(`Theme from "${themePath}": ${validation.warning}`);
      }

      // Use the name from settings (if provided), otherwise use the name from file, otherwise use key
      const themeName = config.name || fileThemeConfig.name || key;

      const themeWithDefaults: CustomTheme = {
        ...DEFAULT_THEME.colors,
        ...fileThemeConfig,
        name: themeName,
        type: 'custom',
      };

      try {
        const theme = createCustomTheme(themeWithDefaults);
        this.customThemes.set(key, theme); // Register under the key from settings
        this.resolvedNameToTheme.set(theme.name, theme); // Register by resolved name
        this.themeFilePaths.set(canonicalPath, key);
      } catch (error) {
        debugLogger.warn(`Failed to create custom theme "${key}":`, error);
      }
    } catch (error) {
      debugLogger.warn(
        `Error loading custom theme file "${themePath}":`,
        error,
      );
    }
  }

  /**
   * Gets a theme name by its file path.
   * @param themePath The path to the theme file.
   * @returns The theme name if found, undefined otherwise.
   */
  getThemeNameByPath(themePath: string): string | undefined {
    try {
      const resolvedPath = path.resolve(themePath);
      if (fs.existsSync(resolvedPath)) {
        const canonicalPath = fs.realpathSync(resolvedPath);
        const key = this.themeFilePaths.get(canonicalPath);
        if (key) {
          return this.customThemes.get(key)?.name; // Return the resolved name
        }
      }
    } catch (_e) {
      return undefined;
    }
    return undefined;
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

    if (this.activeTheme) {
      const isBuiltIn = this.availableThemes.some(
        (t) => t.name === this.activeTheme.name,
      );
      // Check the resolvedNameToTheme for custom themes
      const isCustom = this.resolvedNameToTheme.has(this.activeTheme.name);

      if (isBuiltIn || isCustom) {
        return this.activeTheme;
      }
    }

    // Fallback to default if no active theme or if it's no longer valid.
    this.activeTheme = DEFAULT_THEME;
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

    // Then check custom themes by their resolved name
    const resolvedCustomTheme = this.resolvedNameToTheme.get(themeName);
    if (resolvedCustomTheme) {
      return resolvedCustomTheme;
    }

    // Finally, check custom themes by their key from settings.json
    // This is primarily for backward compatibility or direct lookup by key if needed
    if (this.customThemes.has(themeName)) {
      return this.customThemes.get(themeName);
    }

    // If it's not a built-in, not a resolved custom theme name, and not a settings key,
    // it's not a valid theme.
    return undefined;
  }
}

// Export an instance of the ThemeManager
export const themeManager = new ThemeManager();
