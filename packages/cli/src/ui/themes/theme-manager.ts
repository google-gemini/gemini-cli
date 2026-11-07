/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AyuDark } from './builtin/dark/ayu-dark.js';
import { AyuLight } from './builtin/light/ayu-light.js';
import { AtomOneDark } from './builtin/dark/atom-one-dark.js';
import { Dracula } from './builtin/dark/dracula-dark.js';
import { GitHubDark } from './builtin/dark/github-dark.js';
import { GitHubLight } from './builtin/light/github-light.js';
import { GitHubDarkColorblind } from './builtin/dark/github-dark-colorblind.js';
import { GitHubLightColorblind } from './builtin/light/github-light-colorblind.js';
import { GoogleCode } from './builtin/light/googlecode-light.js';
import { Holiday } from './builtin/dark/holiday-dark.js';
import { DefaultLight } from './builtin/light/default-light.js';
import { DefaultDark } from './builtin/dark/default-dark.js';
import { ShadesOfPurple } from './builtin/dark/shades-of-purple-dark.js';
import { SolarizedDark } from './builtin/dark/solarized-dark.js';
import { SolarizedLight } from './builtin/light/solarized-light.js';
import { XCode } from './builtin/light/xcode-light.js';
import { TokyoNight } from './builtin/dark/tokyonight-dark.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Theme, ThemeType, ColorsTheme, CustomTheme } from './theme.js';
import {
  createCustomTheme,
  validateCustomTheme,
  interpolateColor,
  getThemeTypeFromBackgroundColor,
  resolveColor,
} from './theme.js';
import type { SemanticColors } from './semantic-tokens.js';
import {
  DEFAULT_BACKGROUND_OPACITY,
  DEFAULT_INPUT_BACKGROUND_OPACITY,
  DEFAULT_SELECTION_OPACITY,
  DEFAULT_BORDER_OPACITY,
} from '../constants.js';
import { ANSI } from './builtin/dark/ansi-dark.js';
import { ANSILight } from './builtin/light/ansi-light.js';
import { NoColorTheme } from './builtin/no-color.js';
import process from 'node:process';
import {
  debugLogger,
  GEMINI_DIR,
  homedir,
  isSubpath,
  normalizePath,
  stripExtendedLengthPrefix,
} from '@google/gemini-cli-core';
import stripJsonComments from 'strip-json-comments';

const SINGLE_CUSTOM_THEME_KEYS = new Set([
  'type',
  'name',
  'text',
  'background',
  'border',
  'ui',
  'status',
  'Background',
  'Foreground',
  'LightBlue',
  'AccentBlue',
  'AccentPurple',
  'AccentCyan',
  'AccentGreen',
  'AccentYellow',
  'AccentRed',
  'DiffAdded',
  'DiffRemoved',
  'Comment',
  'Gray',
  'DarkGray',
  'GradientColors',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringValue(value: unknown): value is string {
  return typeof value === 'string';
}

export interface ThemeDisplay {
  name: string;
  type: ThemeType;
  isCustom?: boolean;
}

export const DEFAULT_THEME: Theme = DefaultDark;

class ThemeManager {
  private readonly availableThemes: Theme[];
  private activeTheme: Theme;
  private userThemes: Map<string, Theme> = new Map();
  private userThemesLoaded = false;
  private settingsThemes: Map<string, Theme> = new Map();
  private extensionThemes: Map<string, Theme> = new Map();
  private fileThemes: Map<string, Theme> = new Map();
  private fileThemesByPath: Map<string, Theme> = new Map();
  private terminalBackground: string | undefined;

  // Cache for dynamic colors
  private cachedColors: ColorsTheme | undefined;
  private cachedSemanticColors: SemanticColors | undefined;
  private lastCacheKey: string | undefined;

  private fs: typeof fs;
  private homedir: () => string;

  constructor(dependencies?: { fs?: typeof fs; homedir?: () => string }) {
    this.fs = dependencies?.fs ?? fs;
    this.homedir = dependencies?.homedir ?? homedir;

    this.availableThemes = [
      AyuDark,
      AyuLight,
      AtomOneDark,
      Dracula,
      DefaultLight,
      DefaultDark,
      GitHubDark,
      GitHubLight,
      GitHubDarkColorblind,
      GitHubLightColorblind,
      GoogleCode,
      Holiday,
      ShadesOfPurple,
      SolarizedDark,
      SolarizedLight,
      XCode,
      TokyoNight,
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
    // If the current active theme is a settings theme (and not overridden in theme.json), keep it if still valid
    if (
      this.activeTheme &&
      this.activeTheme.type === 'custom' &&
      !this.userThemes.has(this.activeTheme.name)
    ) {
      const updatedSettingsTheme = this.settingsThemes.get(
        this.activeTheme.name,
      );
      if (updatedSettingsTheme) {
        this.activeTheme = updatedSettingsTheme;
        this.clearCache();
      }
    }
  }

  /**
   * Returns candidate standalone theme.json paths in ascending precedence order:
   * 1. ~/.config/gemini/theme.json
   * 2. $XDG_CONFIG_HOME/gemini/theme.json (if XDG_CONFIG_HOME is set)
   * 3. ~/.gemini/theme.json (respecting GEMINI_CLI_HOME via homedir())
   */
  getUserThemePaths(): string[] {
    const homeDir = this.homedir();
    if (!homeDir) {
      return [];
    }

    const candidates: string[] = [
      path.join(homeDir, '.config', 'gemini', 'theme.json'),
    ];

    const xdgConfigHome = process.env['XDG_CONFIG_HOME'];
    if (xdgConfigHome) {
      candidates.push(path.join(xdgConfigHome, 'gemini', 'theme.json'));
    }

    candidates.push(path.join(homeDir, GEMINI_DIR, 'theme.json'));

    const deduplicatedByKey = new Map<string, string>();
    for (const candidate of candidates) {
      const resolved = path.resolve(candidate);
      const key = normalizePath(resolved);
      deduplicatedByKey.delete(key);
      deduplicatedByKey.set(key, resolved);
    }
    return Array.from(deduplicatedByKey.values());
  }

  private parseUserThemeEntries(
    parsed: unknown,
  ): Array<[string, Partial<CustomTheme>]> {
    if (!isPlainRecord(parsed)) {
      return [];
    }

    const keys = Object.keys(parsed);
    if (keys.length === 0) {
      return [];
    }

    if (parsed['type'] !== 'custom') {
      const customThemes = parsed['customThemes'];
      if (isPlainRecord(customThemes)) {
        return Object.entries(customThemes).filter(
          (entry): entry is [string, Partial<CustomTheme>] =>
            isPlainRecord(entry[1]),
        );
      }

      const ui = parsed['ui'];
      if (isPlainRecord(ui)) {
        const uiCustomThemes = ui['customThemes'];
        if (isPlainRecord(uiCustomThemes)) {
          return Object.entries(uiCustomThemes).filter(
            (entry): entry is [string, Partial<CustomTheme>] =>
              isPlainRecord(entry[1]),
          );
        }
      }
    }

    const rawName = parsed['name'];
    const hasNestedCustomTheme = Object.values(parsed).some(
      (val) => isPlainRecord(val) && val['type'] === 'custom',
    );
    const isSingleTheme =
      !hasNestedCustomTheme &&
      (parsed['type'] === 'custom' ||
        isStringValue(rawName) ||
        keys.every((key) => SINGLE_CUSTOM_THEME_KEYS.has(key)));

    if (isSingleTheme) {
      const themeName =
        isStringValue(rawName) && rawName.trim().length > 0
          ? rawName
          : 'custom';
      return [[themeName, parsed as Partial<CustomTheme>]];
    }

    return Object.entries(parsed).filter(
      (entry): entry is [string, Partial<CustomTheme>] =>
        isPlainRecord(entry[1]),
    );
  }

  private resolveRealPath(targetPath: string): string {
    return stripExtendedLengthPrefix(this.fs.realpathSync(targetPath));
  }

  private resolveCanonicalDirectory(dirPath: string): string {
    const resolvedDir = path.resolve(dirPath);
    try {
      const canonical = this.resolveRealPath(resolvedDir);
      if (isStringValue(canonical) && canonical.length > 0) {
        return path.resolve(canonical);
      }
    } catch {
      // Fall back to resolvedDir when the directory does not exist on disk yet.
    }
    return resolvedDir;
  }

  /**
   * Loads custom themes from standalone user theme.json files
   * (~/.gemini/theme.json and XDG fallback ~/.config/gemini/theme.json).
   */
  loadUserThemes(): void {
    this.userThemes.clear();
    this.userThemesLoaded = true;

    const homeDir = this.homedir();
    if (!homeDir) {
      return;
    }

    const trustedRoots = [this.resolveCanonicalDirectory(homeDir)];
    const xdgConfigHome = process.env['XDG_CONFIG_HOME'];
    if (xdgConfigHome) {
      trustedRoots.push(this.resolveCanonicalDirectory(xdgConfigHome));
    }

    for (const candidatePath of this.getUserThemePaths()) {
      try {
        if (!this.fs.existsSync(candidatePath)) {
          continue;
        }

        const canonicalPath = this.resolveRealPath(candidatePath);
        if (
          !trustedRoots.some((rootDir) => isSubpath(rootDir, canonicalPath))
        ) {
          debugLogger.warn(
            `Theme file at "${candidatePath}" resolves outside trusted configuration directories. ` +
              `Only load themes from trusted sources.`,
          );
          continue;
        }

        const rawContent = this.fs.readFileSync(canonicalPath, 'utf-8');
        const parsed: unknown = JSON.parse(stripJsonComments(rawContent));
        if (!isPlainRecord(parsed)) {
          debugLogger.warn(
            `Invalid theme file "${candidatePath}": expected a JSON object.`,
          );
          continue;
        }

        const entries = this.parseUserThemeEntries(parsed);
        for (const [entryKey, rawThemeConfig] of entries) {
          const rawConfigName: unknown = rawThemeConfig.name;
          const resolvedName =
            isStringValue(rawConfigName) && rawConfigName.trim().length > 0
              ? rawConfigName
              : entryKey;
          const candidateConfig: Partial<CustomTheme> = {
            ...rawThemeConfig,
            name: resolvedName,
          };

          const validation = validateCustomTheme(candidateConfig);
          if (!validation.isValid) {
            debugLogger.warn(
              `Invalid custom theme "${entryKey}" in "${candidatePath}": ${validation.error}`,
            );
            continue;
          }

          if (validation.warning) {
            debugLogger.warn(`Theme "${entryKey}": ${validation.warning}`);
          }

          const themeWithDefaults: CustomTheme = {
            ...DEFAULT_THEME.colors,
            ...candidateConfig,
            name: resolvedName,
            type: 'custom',
          };

          try {
            const theme = createCustomTheme(themeWithDefaults);
            this.userThemes.set(resolvedName, theme);
          } catch (error) {
            debugLogger.warn(
              `Failed to load custom theme "${entryKey}" from "${candidatePath}":`,
              error,
            );
          }
        }
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT'
          )
        ) {
          debugLogger.warn(
            `Could not load themes from "${candidatePath}":`,
            error,
          );
        }
      }
    }

    this.clearCache();

    if (this.activeTheme && this.activeTheme.type === 'custom') {
      const updatedUserTheme = this.userThemes.get(this.activeTheme.name);
      if (updatedUserTheme) {
        this.activeTheme = updatedUserTheme;
      }
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
    }
  }

  /**
   * Checks if themes for a given extension are already registered.
   * @param extensionName The name of the extension.
   * @returns True if any themes from the extension are registered.
   */
  hasExtensionThemes(extensionName: string): boolean {
    return Array.from(this.extensionThemes.keys()).some((name) =>
      name.endsWith(`(${extensionName})`),
    );
  }

  /**
   * Clears all registered extension themes.
   * This is primarily for testing purposes to reset state between tests.
   */
  clearExtensionThemes(): void {
    this.extensionThemes.clear();
  }

  /**
   * Clears all standalone user themes loaded from theme.json files.
   * This is primarily for testing purposes to reset state between tests.
   */
  clearUserThemes(): void {
    this.userThemes.clear();
    this.userThemesLoaded = false;
  }

  /**
   * Clears all themes loaded from files.
   * This is primarily for testing purposes to reset state between tests.
   */
  clearFileThemes(): void {
    this.fileThemes.clear();
    this.fileThemesByPath.clear();
  }

  /**
   * Re-initializes the ThemeManager with new dependencies.
   * This is primarily for testing to allow injecting mocks.
   */
  reinitialize(dependencies: { fs?: typeof fs; homedir?: () => string }): void {
    if (dependencies.fs) {
      this.fs = dependencies.fs;
    }
    if (dependencies.homedir) {
      this.homedir = dependencies.homedir;
    }
    this.userThemes.clear();
    this.userThemesLoaded = false;
    this.fileThemes.clear();
    this.fileThemesByPath.clear();
  }

  /**
   * Resets the ThemeManager state to defaults.
   * This is for testing purposes to ensure test isolation.
   */
  resetForTesting(dependencies?: {
    fs?: typeof fs;
    homedir?: () => string;
  }): void {
    if (dependencies) {
      this.reinitialize(dependencies);
    }
    this.userThemes.clear();
    this.userThemesLoaded = false;
    this.settingsThemes.clear();
    this.extensionThemes.clear();
    this.fileThemes.clear();
    this.fileThemesByPath.clear();
    this.activeTheme = DEFAULT_THEME;
    this.terminalBackground = undefined;
    this.clearCache();
  }
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
        this.userThemes.get(this.activeTheme.name) === this.activeTheme ||
        this.settingsThemes.get(this.activeTheme.name) === this.activeTheme ||
        this.extensionThemes.get(this.activeTheme.name) === this.activeTheme ||
        this.fileThemes.get(this.activeTheme.name) === this.activeTheme;

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
        DarkGray: interpolateColor(
          this.terminalBackground,
          colors.Gray,
          DEFAULT_BORDER_OPACITY,
        ),
        InputBackground: interpolateColor(
          this.terminalBackground,
          colors.Gray,
          DEFAULT_INPUT_BACKGROUND_OPACITY,
        ),
        MessageBackground: interpolateColor(
          this.terminalBackground,
          colors.Gray,
          DEFAULT_BACKGROUND_OPACITY,
        ),
        FocusBackground: interpolateColor(
          this.terminalBackground,
          activeTheme.colors.FocusColor ?? activeTheme.colors.AccentGreen,
          DEFAULT_SELECTION_OPACITY,
        ),
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
      const colors = this.getColors();
      this.cachedSemanticColors = {
        ...semanticColors,
        background: {
          ...semanticColors.background,
          primary: this.terminalBackground,
          message: colors.MessageBackground!,
          input: colors.InputBackground!,
          focus: colors.FocusBackground!,
        },
        border: {
          ...semanticColors.border,
          default: colors.DarkGray,
        },
        ui: {
          ...semanticColors.ui,
          dark: colors.DarkGray,
          focus: colors.FocusColor ?? colors.AccentGreen,
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
    if (!this.userThemesLoaded) {
      this.loadUserThemes();
    }
    const mergedByName = new Map<string, Theme>([
      ...this.fileThemes,
      ...this.extensionThemes,
      ...this.settingsThemes,
      ...this.userThemes,
    ]);
    return Array.from(mergedByName.values());
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
    if (!this.userThemesLoaded) {
      this.loadUserThemes();
    }
    return (
      this.userThemes.has(themeName) ||
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
      const canonicalPath = this.resolveRealPath(path.resolve(themePath));

      // 1. Check cache using the canonical path.
      if (this.fileThemesByPath.has(canonicalPath)) {
        return this.fileThemesByPath.get(canonicalPath);
      }

      // 2. Perform security check.
      const rawHome = this.homedir();
      if (!rawHome) {
        return undefined;
      }
      const canonicalHome = this.resolveCanonicalDirectory(rawHome);
      if (!isSubpath(canonicalHome, canonicalPath)) {
        debugLogger.warn(
          `Theme file at "${themePath}" is outside your home directory. ` +
            `Only load themes from trusted sources.`,
        );
        return undefined;
      }

      // 3. Read, parse, and validate the theme file.
      const themeContent = this.fs.readFileSync(canonicalPath, 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const customThemeConfig = JSON.parse(
        stripJsonComments(themeContent),
      ) as CustomTheme;

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
      this.fileThemesByPath.set(canonicalPath, theme);
      this.fileThemes.set(theme.name, theme);
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

    // Then check custom themes that have been loaded from theme.json, settings, extensions, or file paths
    if (this.isPath(themeName)) {
      return this.loadThemeFromFile(themeName);
    }

    if (!this.userThemesLoaded) {
      this.loadUserThemes();
    }

    if (this.userThemes.has(themeName)) {
      return this.userThemes.get(themeName);
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
