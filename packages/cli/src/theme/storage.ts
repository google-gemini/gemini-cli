/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CustomTheme } from './types.js';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Interface for the settings object structure
 */
interface SettingsWithThemes {
  customThemes?: Record<string, CustomTheme>;
  [key: string]: unknown;
}

/**
 * Get the themes directory path for the current user
 */
function getThemesDirectory(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.gemini', 'themes');
}

/**
 * Ensure the themes directory exists
 */
async function ensureThemesDirectory(): Promise<string> {
  const themesDir = getThemesDirectory();
  try {
    await fsPromises.mkdir(themesDir, { recursive: true });
    return themesDir;
  } catch (error) {
    throw new Error(`Failed to create themes directory: ${error}`);
  }
}

/**
 * Save a theme to a dedicated theme file
 */
export async function saveThemeToFile(theme: CustomTheme): Promise<string> {
  try {
    const themesDir = await ensureThemesDirectory();

    // Create a safe filename from the theme name
    const safeFileName = theme.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const themeFilePath = path.join(themesDir, `${safeFileName}.json`);

    // Create the theme file with metadata
    const themeFileContent = {
      metadata: {
        name: theme.name,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'vscode-theme-installer',
      },
      theme,
    };

    await fsPromises.writeFile(
      themeFilePath,
      JSON.stringify(themeFileContent, null, 2),
      'utf8',
    );

    console.log(`✅ Theme "${theme.name}" saved to: ${themeFilePath}`);
    return themeFilePath;
  } catch (error) {
    throw new Error(`Failed to save theme to file: ${error}`);
  }
}

/**
 * Load a theme from a theme file
 */
export async function loadThemeFromFile(
  themeFilePath: string,
): Promise<CustomTheme | null> {
  try {
    const fileContent = await fsPromises.readFile(themeFilePath, 'utf8');
    const themeFileData = JSON.parse(fileContent);

    // Support both new format (with metadata) and legacy format
    if (themeFileData.theme) {
      return themeFileData.theme as CustomTheme;
    } else {
      // Legacy format - the whole file is the theme
      return themeFileData as CustomTheme;
    }
  } catch (error) {
    console.warn(`Failed to load theme from ${themeFilePath}:`, error);
    return null;
  }
}

/**
 * List all available theme files
 */
export async function listThemeFiles(): Promise<
  Array<{ name: string; path: string }>
> {
  try {
    const themesDir = getThemesDirectory();

    // Check if themes directory exists
    try {
      await fsPromises.access(themesDir);
    } catch {
      // Directory doesn't exist, return empty list
      return [];
    }

    const files = await fsPromises.readdir(themesDir);
    const themeFiles = files
      .filter((file) => file.endsWith('.json'))
      .map((file) => ({
        name: path.basename(file, '.json'),
        path: path.join(themesDir, file),
      }));

    return themeFiles;
  } catch (error) {
    console.warn('Failed to list theme files:', error);
    return [];
  }
}

/**
 * Legacy function: Save theme to settings.json (deprecated)
 * Maintained for backward compatibility
 */
export async function saveThemeToSettings(
  theme: CustomTheme,
  settingsPath: string,
): Promise<void> {
  console.warn(
    'saveThemeToSettings is deprecated. Use saveThemeToFile instead.',
  );

  try {
    // Check if settings file exists
    let settings: SettingsWithThemes = {};

    try {
      const settingsContent = await fsPromises.readFile(settingsPath, 'utf8');
      settings = JSON.parse(settingsContent);
    } catch (_error) {
      // File doesn't exist or is invalid, start with empty settings
      console.log('Creating new settings file...');
    }

    // Initialize customThemes if it doesn't exist
    if (!settings.customThemes) {
      settings.customThemes = {};
    }

    // Add or update the theme
    settings.customThemes[theme.name] = theme;

    // Write back to file
    await fsPromises.writeFile(
      settingsPath,
      JSON.stringify(settings, null, 2),
      'utf8',
    );
    console.log(`✅ Theme "${theme.name}" saved to settings`);
  } catch (_error) {
    throw new Error(`Failed to save theme to settings: ${_error}`);
  }
}
