/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CustomTheme } from './theme-types.js';
import { promises as fsPromises } from 'fs';
import path from 'path';

/**
 * Saves a custom theme to user settings
 */
export async function saveThemeToSettings(customTheme: CustomTheme, signal: AbortSignal): Promise<string> {
  const userHome = process.env.HOME || process.env.USERPROFILE || '';
  const settingsPath = path.join(userHome, '.gemini', 'settings.json');

  // Ensure .gemini directory exists
  await fsPromises.mkdir(path.dirname(settingsPath), { recursive: true });

  // Read existing settings or create new ones
  let settings: any = {};
  try {
    const settingsContent = await fsPromises.readFile(settingsPath, 'utf-8');
    settings = JSON.parse(settingsContent);
  } catch (error) {
    // File doesn't exist or is invalid, start with empty settings
  }

  // Initialize customThemes if it doesn't exist
  if (!settings.customThemes) {
    settings.customThemes = {};
  }

  // Generate a unique theme name if there are conflicts
  let themeName = customTheme.name;
  let counter = 1;
  while (settings.customThemes[themeName]) {
    themeName = `${customTheme.name} (${counter})`;
    counter++;
  }

  // Add the theme to settings
  settings.customThemes[themeName] = customTheme;

  // Write settings back to file
  await fsPromises.writeFile(settingsPath, JSON.stringify(settings, null, 2));

  return themeName;
} 