/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { CustomTheme } from './theme.js';

// Uses shared CustomTheme type from theme.ts

/**
 * Theme file structure with metadata
 */
interface ThemeFileData {
  metadata?: {
    name: string;
    version: string;
    createdAt: string;
    updatedAt: string;
    source: string;
  };
  theme: CustomTheme;
}

/**
 * Combined themes from both settings and file-based storage
 */
export interface CombinedThemes {
  settingsThemes: Record<string, CustomTheme>;
  fileThemes: Record<string, CustomTheme>;
  allThemes: Record<string, CustomTheme>;
}

/**
 * Get the themes directory path
 */
export function getThemesDirectory(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.gemini', 'themes');
}

/**
 * Load themes from file-based storage
 */
export async function loadFileBasedThemes(): Promise<Record<string, CustomTheme>> {
  const themes: Record<string, CustomTheme> = {};
  
  try {
    const themesDir = getThemesDirectory();
    
    // Check if themes directory exists
    try {
      await fs.access(themesDir);
    } catch {
      // Directory doesn't exist, return empty themes
      return themes;
    }
    
    const files = await fs.readdir(themesDir);
    const themeFiles = files.filter(file => file.endsWith('.json'));
    
    for (const file of themeFiles) {
      try {
        const filePath = path.join(themesDir, file);
        const fileContent = await fs.readFile(filePath, 'utf8');
        const themeData: ThemeFileData | CustomTheme = JSON.parse(fileContent);
        
        // Support both new format (with metadata) and legacy format
        let theme: CustomTheme;
        if ('theme' in themeData && themeData.theme) {
          theme = themeData.theme;
        } else {
          theme = themeData as CustomTheme;
        }
        
        // Use theme name as key
        if (theme.name) {
          themes[theme.name] = theme;
        }
      } catch (error) {
        console.warn(`Failed to load theme file ${file}:`, error);
      }
    }
  } catch (error) {
    console.warn('Failed to load file-based themes:', error);
  }
  
  return themes;
}

/**
 * Load and combine themes from both settings and file-based storage
 */
export async function loadCombinedThemes(settingsThemes: Record<string, CustomTheme> = {}): Promise<CombinedThemes> {
  const fileThemes = await loadFileBasedThemes();
  
  // Combine themes, with file-based themes taking precedence over settings themes
  // if there are naming conflicts
  const allThemes = {
    ...settingsThemes,
    ...fileThemes
  };
  
  return {
    settingsThemes,
    fileThemes,
    allThemes
  };
}

/**
 * Get all available custom themes (convenience function)
 */
export async function getAllCustomThemes(settingsThemes: Record<string, CustomTheme> = {}): Promise<Record<string, CustomTheme>> {
  const combined = await loadCombinedThemes(settingsThemes);
  return combined.allThemes;
}
