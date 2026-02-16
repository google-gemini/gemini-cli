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
import { Holiday } from './holiday.js';
import { DefaultLight } from './default-light.js';
import { DefaultDark } from './default.js';
import { ShadesOfPurple } from './shades-of-purple.js';
import { SolarizedDark } from './solarized-dark.js';
import { SolarizedLight } from './solarized-light.js';
import { XCode } from './xcode.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Theme, ThemeType, ColorsTheme } from './theme.js';
import type { CustomTheme } from '@google/gemini-cli-core';
import { createCustomTheme, validateCustomTheme } from './theme.js';
import type { SemanticColors } from './semantic-tokens.js';
import {
  interpolateColor,
  getThemeTypeFromBackgroundColor,
  resolveColor,
} from './color-utils.js';
import { DEFAULT_BORDER_OPACITY } from '../constants.js';
import { ANSI } from './ansi.js';
import { ANSILight } from './ansi-light.js';
import { NoColorTheme } from './no-color.js';
import process from 'node:process';
import { debugLogger, homedir } from '@google/gemini-cli-core';

export interface ThemeDisplay {
  name: string;
  type: ThemeType;
  isCustom?: boolean;
}

export const DEFAULT_THEME: Theme = DefaultDark;

class ThemeManager {
  private readonly availableThemes: Theme[];
  private activeTheme: Theme;
  private settingsThemes: Map<string, Theme> = new Map();
  private extensionThemes: Map<string, Theme> = new Map();
  private fileThemes: Map<string, Theme> = new Map();
  private terminalBackground: string | undefined;

  // Cache for dynamic colors
  private cachedColors: ColorsTheme | undefined;
  private cachedSemanticColors: SemanticColors | undefined;
  private lastCacheKey: string | undefined;

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
      Holiday,
      ShadesOfPurple,
      SolarizedDark,
      SolarizedLight,
      XCode,
      ANSI,
      ANSILight,
    ];
    this.activeTheme = DEFAULT_THEME;
  }

  setTerminalBackground(color: string | undefined): void {
    if (this.terminalBackground !== color) {
      this.terminalBackground = color;
      this.clearCache();
    }
  }

  getTerminalBackground(): string | undefined {
    return this.terminalBackground;
  }

  private clearCache(): void {
    this.cachedColors = undefined;
    this.cachedSemanticColors = undefined;
    this.lastCacheKey = undefined;
  }

  isDefaultTheme(themeName: string | undefined): boolean {
    return (
      themeName === undefined ||
      themeName === DEFAULT_THEME.name ||
      themeName === DefaultLight.name
    );
  }

  /**
   * Loads custom themes from settings.
   * @param customThemesSettings Custom themes from settings.
   */
  loadCustomThemes(customThemesSettings?: Record<string, CustomTheme>): void {
    this.settingsThemes.clear();

    if (!customThemesSettings) {
      return;
    }

    for (const [name, customThemeConfig] of Object.entries(
      customThemesSettings,
    )) {
      const validation = validateCustomTheme(customThemeConfig);
      if (validation.isValid) {
        if (validation.warning) {
          debugLogger.warn(`Theme "${name}": ${validation.warning}`);
        }
        const themeWithDefaults: CustomTheme = {
          ...DEFAULT_THEME.colors,
          ...customThemeConfig,
          name: customThemeConfig.name || name,
          type: 'custom',
        };

        try {
          const theme = createCustomTheme(themeWithDefaults);
          this.settingsThemes.set(name, theme);
        } catch (error) {
          debugLogger.warn(`Failed to load custom theme "${name}":`, error);
        }
      } else {
        debugLogger.warn(`Invalid custom theme "${name}": ${validation.error}`);
      }
    }
    // If the current active theme is a settings theme, keep it if still valid
    if (
      this.activeTheme &&
      this.activeTheme.type === 'custom' &&
      this.settingsThemes.has(this.activeTheme.name)
    ) {
      this.activeTheme = this.settingsThemes.get(this.activeTheme.name)!;
    }
  }

  /**
   * Loads custom themes from extensions.
   * @param extensionName The name of the extension providing the themes.
   * @param customThemes Custom themes from extensions.
   */
  registerExtensionThemes(
    extensionName: string,
    customThemes?: CustomTheme[],
  ): void {
    if (!customThemes) {
      return;
    }

    debugLogger.log(
      `Registering extension themes for "${extensionName}":`,
      customThemes,
    );

    for (const customThemeConfig of customThemes) {
      const namespacedName = `${customThemeConfig.name} (${extensionName})`;

      // Check for collisions with built-in themes (unlikely with prefix, but safe)
      if (this.availableThemes.some((t) => t.name === namespacedName)) {
        debugLogger.warn(
          `Theme name collision: "${namespacedName}" is a built-in theme. Skipping.`,
        );
        continue;
      }

      const validation = validateCustomTheme(customThemeConfig);
      if (validation.isValid) {
        if (validation.warning) {
          debugLogger.warn(`Theme "${namespacedName}": ${validation.warning}`);
        }
        const themeWithDefaults: CustomTheme = {
          ...DEFAULT_THEME.colors,
          ...customThemeConfig,
          name: namespacedName,
          type: 'custom',
        };

        try {
          const theme = createCustomTheme(themeWithDefaults);
          this.extensionThemes.set(namespacedName, theme);
          debugLogger.log(`Registered theme: ${namespacedName}`);
        } catch (error) {
          debugLogger.warn(
            `Failed to load custom theme "${namespacedName}":`,
            error,
          );
        }
      } else {
        debugLogger.warn(
          `Invalid custom theme "${namespacedName}": ${validation.error}`,
        );
      }
    }
  }

  /**
   * Unregisters custom themes from extensions.
   * @param extensionName The name of the extension.
   * @param customThemes Custom themes to unregister.
   */
  unregisterExtensionThemes(
    extensionName: string,
    customThemes?: CustomTheme[],
  ): void {
    if (!customThemes) {
      return;
    }

    for (const theme of customThemes) {
      const namespacedName = `${theme.name} (${extensionName})`;
      this.extensionThemes.delete(namespacedName);
      debugLogger.log(`Unregistered theme: ${namespacedName}`);
    }
  }

  /**
   * Clears all registered extension themes.
   * This is primarily for testing purposes to reset state between tests.
   */
  clearExtensionThemes(): void {
    this.extensionThemes.clear();
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
    if (this.activeTheme !== theme) {
      this.activeTheme = theme;
      this.clearCache();
    }
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
      const isCustom =
        [...this.settingsThemes.values()].includes(this.activeTheme) ||
        [...this.extensionThemes.values()].includes(this.activeTheme) ||
        [...this.fileThemes.values()].includes(this.activeTheme);

      if (isBuiltIn || isCustom) {
        return this.activeTheme;
      }

      // If the theme object is no longer valid, try to find it again by name.
      // This handles the case where extensions are reloaded and theme objects
      // are re-created.
      const reloadedTheme = this.findThemeByName(this.activeTheme.name);
      if (reloadedTheme) {
        this.activeTheme = reloadedTheme;
        return this.activeTheme;
      }
    }

    // Fallback to default if no active theme or if it's no longer valid.
    this.activeTheme = DEFAULT_THEME;
    return this.activeTheme;
  }

  /**
   * Gets the colors for the active theme, respecting the terminal background.
   * @returns The theme colors.
   */
  getColors(): ColorsTheme {
    const activeTheme = this.getActiveTheme();
    const cacheKey = `${activeTheme.name}:${this.terminalBackground}`;
    if (this.cachedColors && this.lastCacheKey === cacheKey) {
      return this.cachedColors;
    }

    const colors = activeTheme.colors;
    if (
      this.terminalBackground &&
      this.isThemeCompatible(activeTheme, this.terminalBackground)
    ) {
      this.cachedColors = {
        ...colors,
        Background: this.terminalBackground,
        DarkGray: interpolateColor(colors.Gray, this.terminalBackground, 0.5),
      };
    } else {
      this.cachedColors = colors;
    }

    this.lastCacheKey = cacheKey;
    return this.cachedColors;
  }

  /**
   * Gets the semantic colors for the active theme.
   * @returns The semantic colors.
   */
  getSemanticColors(): SemanticColors {
    const activeTheme = this.getActiveTheme();
    const cacheKey = `${activeTheme.name}:${this.terminalBackground}`;
    if (this.cachedSemanticColors && this.lastCacheKey === cacheKey) {
      return this.cachedSemanticColors;
    }

    const semanticColors = activeTheme.semanticColors;
    if (
      this.terminalBackground &&
      this.isThemeCompatible(activeTheme, this.terminalBackground)
    ) {
      this.cachedSemanticColors = {
        ...semanticColors,
        background: {
          ...semanticColors.background,
          primary: this.terminalBackground,
        },
        border: {
          ...semanticColors.border,
          default: interpolateColor(
            this.terminalBackground,
            activeTheme.colors.Gray,
            DEFAULT_BORDER_OPACITY,
          ),
        },
        ui: {
          ...semanticColors.ui,
          dark: interpolateColor(
            activeTheme.colors.Gray,
            this.terminalBackground,
            0.5,
          ),
        },
      };
    } else {
      this.cachedSemanticColors = semanticColors;
    }

    this.lastCacheKey = cacheKey;
    return this.cachedSemanticColors;
  }

  isThemeCompatible(
    activeTheme: Theme,
    terminalBackground: string | undefined,
  ): boolean {
    if (activeTheme.type === 'ansi') {
      return true;
    }

    const backgroundType = getThemeTypeFromBackgroundColor(terminalBackground);
    if (!backgroundType) {
      return true;
    }

    const themeType =
      activeTheme.type === 'custom'
        ? getThemeTypeFromBackgroundColor(
            resolveColor(activeTheme.colors.Background) ||
              activeTheme.colors.Background,
          )
        : activeTheme.type;

    return themeType === backgroundType;
  }

  private _getAllCustomThemes(): Theme[] {
    return [
      ...Array.from(this.settingsThemes.values()),
      ...Array.from(this.extensionThemes.values()),
      ...Array.from(this.fileThemes.values()),
    ];
  }

  /**
   * Gets a list of custom theme names.
   * @returns Array of custom theme names.
   */
  getCustomThemeNames(): string[] {
    return this._getAllCustomThemes().map((theme) => theme.name);
  }

  /**
   * Checks if a theme name is a custom theme.
   * @param themeName The theme name to check.
   * @returns True if the theme is custom.
   */
  isCustomTheme(themeName: string): boolean {
    return (
      this.settingsThemes.has(themeName) ||
      this.extensionThemes.has(themeName) ||
      this.fileThemes.has(themeName)
    );
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

    const customThemes = this._getAllCustomThemes().map((theme) => ({
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
   * Gets a theme by name.
   * @param themeName The name of the theme to get.
   * @returns The theme if found, undefined otherwise.
   */
  getTheme(themeName: string): Theme | undefined {
    return this.findThemeByName(themeName);
  }

  /**
   * Gets all available themes.
   * @returns A list of all available themes.
   */
  getAllThemes(): Theme[] {
    return [...this.availableThemes, ...this._getAllCustomThemes()];
  }

  private isPath(themeName: string): boolean {
    return (
      themeName.endsWith('.json') ||
      themeName.startsWith('.') ||
      path.isAbsolute(themeName)
    );
  }

  private loadThemeFromFile(themePath: string): Theme | undefined {
    try {
      // realpathSync resolves the path and throws if it doesn't exist.
      const canonicalPath = fs.realpathSync(path.resolve(themePath));

      // 1. Check cache using the canonical path.
      if (this.fileThemes.has(canonicalPath)) {
        return this.fileThemes.get(canonicalPath);
      }

      // 2. Perform security check.
      const homeDir = path.resolve(homedir());
      if (!canonicalPath.startsWith(homeDir)) {
        debugLogger.warn(
          `Theme file at "${themePath}" is outside your home directory. ` +
            `Only load themes from trusted sources.`,
        );
        return undefined;
      }

      // 3. Read, parse, and validate the theme file.
      const themeContent = fs.readFileSync(canonicalPath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const customThemeConfig = JSON.parse(themeContent) as CustomTheme;

      const validation = validateCustomTheme(customThemeConfig);
      if (!validation.isValid) {
        debugLogger.warn(
          `Invalid custom theme from file "${themePath}": ${validation.error}`,
        );
        return undefined;
      }

      if (validation.warning) {
        debugLogger.warn(`Theme from "${themePath}": ${validation.warning}`);
      }

      // 4. Create and cache the theme.
      const themeWithDefaults: CustomTheme = {
        ...DEFAULT_THEME.colors,
        ...customThemeConfig,
        name: customThemeConfig.name || canonicalPath,
        type: 'custom',
      };

      const theme = createCustomTheme(themeWithDefaults);
      this.fileThemes.set(canonicalPath, theme); // Cache by canonical path
      return theme;
    } catch (error) {
      // Any error in the process (file not found, bad JSON, etc.) is caught here.
      // We can return undefined silently for file-not-found, and warn for others.
      if (
        !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
      ) {
        debugLogger.warn(
          `Could not load theme from file "${themePath}":`,
          error,
        );
      }
      return undefined;
    }
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

    // Then check custom themes that have been loaded from settings, extensions, or file paths
    if (this.isPath(themeName)) {
      return this.loadThemeFromFile(themeName);
    }

    if (this.settingsThemes.has(themeName)) {
      return this.settingsThemes.get(themeName);
    }

    if (this.extensionThemes.has(themeName)) {
      return this.extensionThemes.get(themeName);
    }

    if (this.fileThemes.has(themeName)) {
      return this.fileThemes.get(themeName);
    }

    // If it's not a built-in, not in cache, and not a valid file path,
    // it's not a valid theme.
    return undefined;
  }
}

// Export an instance of the ThemeManager
export const themeManager = new ThemeManager();
