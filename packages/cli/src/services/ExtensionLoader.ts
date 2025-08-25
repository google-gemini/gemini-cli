/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { LoadedSettings, SettingScope } from '../config/settings.js';
import { CustomTheme } from '../ui/themes/theme.js';

const getExtensionsPath = (): string => {
  const homeDir = process.env['HOME'] || process.env['USERPROFILE'];
  if (!homeDir) {
    console.warn('Could not determine home directory to load extensions.');
    return '';
  }
  return path.join(homeDir, '.gemini', 'extensions');
};

export function loadThemesFromExtensions(settings: LoadedSettings): void {
  const extensionsPath = getExtensionsPath();
  if (!extensionsPath || !fs.existsSync(extensionsPath)) {
    return;
  }

  const extensionFolders = fs
    .readdirSync(extensionsPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => path.join(extensionsPath, dirent.name));

  const discoveredCustomThemes: Record<string, CustomTheme> = {};

  for (const folderPath of extensionFolders) {
    const packageJsonPath = path.join(folderPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      continue;
    }
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const themeContributions = packageJson.contributes?.themes;
      if (Array.isArray(themeContributions)) {
        for (const themeInfo of themeContributions) {
          const themePath = path.join(folderPath, themeInfo.path);
          const themeJsonContent = fs.readFileSync(themePath, 'utf-8');
          const customTheme: CustomTheme = JSON.parse(themeJsonContent);
          discoveredCustomThemes[customTheme.name] = customTheme;
        }
      }
    } catch (error) {
      console.error(
        `Failed to load themes from extension at ${folderPath}:`,
        error,
      );
    }
  }

  if (Object.keys(discoveredCustomThemes).length === 0) {
    return;
  }

  // --- THIS IS THE FINAL, CORRECT LOGIC ---

  // 1. Get the custom themes that are already loaded from the user's settings.json files.
  const existingCustomThemes = settings.merged.customThemes || {};

  // 2. Merge our discovered themes with the existing ones.
  const allCustomThemes = {
    ...existingCustomThemes,
    ...discoveredCustomThemes,
  };

  // 3. Use the official API to update the settings.
  //    This will ensure the UI state is correctly updated. We will set this at the
  //    "User" scope as a safe default.
  settings.setValue(SettingScope.User, 'customThemes', allCustomThemes);
}
