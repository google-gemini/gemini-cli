/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getThemesDirectory } from './theme-loader.js';
import type { CustomTheme } from './theme.js';
import { themeManager } from './theme-manager.js';

export interface PersistedThemeMetadata {
  name: string;
  version?: string;
  source?: string; // e.g., 'vscode-marketplace:<publisher>.<extension>'
  createdAt?: string; // ISO string
  updatedAt?: string; // ISO string
}

export interface PersistedThemeFile {
  metadata: PersistedThemeMetadata;
  theme: CustomTheme;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-z0-9-_.]/gi, '_');
}

export async function persistTheme(theme: CustomTheme, metadata: PersistedThemeMetadata): Promise<string> {
  const dir = getThemesDirectory();
  await fs.mkdir(dir, { recursive: true });

  const fileName = sanitizeFileName(`${theme.name || metadata.name}.json`);
  const filePath = path.join(dir, fileName);

  const now = new Date().toISOString();
  const fileContents: PersistedThemeFile = {
    metadata: {
      name: theme.name || metadata.name,
      version: metadata.version,
      source: metadata.source,
      createdAt: metadata.createdAt || now,
      updatedAt: now,
    },
    theme: {
      ...theme,
      name: theme.name || metadata.name,
      type: 'custom',
    },
  };

  await fs.writeFile(filePath, JSON.stringify(fileContents, null, 2), 'utf8');

  return filePath;
}

export async function persistThemeAndReload(theme: CustomTheme, metadata: PersistedThemeMetadata, mergedSettingsThemes: Record<string, CustomTheme> = {}): Promise<string> {
  const filePath = await persistTheme(theme, metadata);
  // Ensure the runtime picks up the new file-based theme
  await themeManager.loadCustomThemes(mergedSettingsThemes);
  return filePath;
}
