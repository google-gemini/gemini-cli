/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThemeManager } from './theme-manager.js';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path'; // Import path module for basename

vi.mock('node:fs');
vi.mock('node:fs/promises');
vi.mock('node:os');

describe('ThemeManager Custom Files', () => {
  let themeManager: ThemeManager;
  const mockHomeDir = '/home/user';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue(mockHomeDir);
    themeManager = new ThemeManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to mock a theme file
  const mockThemeFile = (filePath: string, content: unknown) => {
    const resolvedPath = path.resolve(filePath);
    vi.spyOn(fsPromises, 'realpath').mockImplementation(async (p) =>
      p === resolvedPath ? resolvedPath : (p as string),
    );
    vi.spyOn(fsPromises, 'readFile').mockImplementation(async (p) => {
      if (p === resolvedPath) {
        return JSON.stringify(content);
      }
      throw new Error('File not found');
    });
    vi.spyOn(fsPromises, 'access').mockImplementation(async (p) => {
      if (p === resolvedPath) {
        return undefined;
      }
      throw new Error('File not found');
    });

    // Also mock synchronous fs methods used by getThemeNameByPath
    vi.mocked(fs.realpathSync).mockImplementation((p) =>
      p === resolvedPath ? resolvedPath : (p as string),
    );
    vi.mocked(fs.existsSync).mockImplementation((p) => p === resolvedPath);
  };

  it('should load an inline custom theme', async () => {
    await themeManager.loadCustomThemes({
      'My Inline Theme': {
        type: 'custom',
        name: 'My Inline Theme',
        Background: '#FF0000',
      },
    });

    const theme = themeManager.getTheme('My Inline Theme');
    expect(theme).toBeDefined();
    expect(theme?.colors.Background).toBe('#FF0000');
    expect(theme?.name).toBe('My Inline Theme');
    expect(theme?.type).toBe('custom');
  });

  it('should load a file-based theme with name from settings', async () => {
    const themePath = '/home/user/themes/file-theme-with-name.json';
    const fileContent = {
      name: 'Name From File',
      Background: '#00FF00',
    };
    mockThemeFile(themePath, fileContent);

    await themeManager.loadCustomThemes({
      'My File Theme (from Settings)': {
        path: themePath,
        name: 'My File Theme (from Settings)',
        type: 'custom',
      },
    });

    const theme = themeManager.getTheme('My File Theme (from Settings)');
    expect(theme).toBeDefined();
    expect(theme?.colors.Background).toBe('#00FF00');
    expect(theme?.name).toBe('My File Theme (from Settings)');
    expect(theme?.type).toBe('custom');
    expect(themeManager.getThemeNameByPath(themePath)).toBe(
      'My File Theme (from Settings)',
    );
  });

  it('should load a file-based theme with name from file content', async () => {
    const themePath = '/home/user/themes/file-theme-no-name-in-settings.json';
    const fileContent = {
      name: 'Name From File Content',
      Background: '#0000FF',
    };
    mockThemeFile(themePath, fileContent);

    await themeManager.loadCustomThemes({
      SomeKeyForFileTheme: {
        // Key in settings.json
        path: themePath,
        type: 'custom',
      },
    });

    // We should be able to get it by the resolved name from the file
    const theme = themeManager.getTheme('Name From File Content');
    expect(theme).toBeDefined();
    expect(theme?.colors.Background).toBe('#0000FF');
    expect(theme?.name).toBe('Name From File Content');
    // themeFilePaths maps canonicalPath to settings key, not resolved name
    const resolvedPath = path.resolve(themePath);
    expect(themeManager.themeFilePaths.get(resolvedPath)).toBe(
      'SomeKeyForFileTheme',
    );
  });

  it('should load a file-based theme with name from settings key if no name in file or settings', async () => {
    const themePath = '/home/user/themes/file-theme-no-name-anywhere.json';
    const fileContent = {
      Background: '#FFFF00',
    };
    mockThemeFile(themePath, fileContent);

    await themeManager.loadCustomThemes({
      KeyAsNameTheme: {
        // Key in settings.json
        path: themePath,
        type: 'custom',
      },
    });

    // It should be retrievable by the key, as the key becomes the name
    const theme = themeManager.getTheme('KeyAsNameTheme');
    expect(theme).toBeDefined();
    expect(theme?.colors.Background).toBe('#FFFF00');
    expect(theme?.name).toBe('KeyAsNameTheme');
    // themeFilePaths maps canonicalPath to settings key
    const resolvedPath = path.resolve(themePath);
    expect(themeManager.themeFilePaths.get(resolvedPath)).toBe(
      'KeyAsNameTheme',
    );
  });

  it('should return undefined for a non-existent theme', async () => {
    await themeManager.loadCustomThemes({}); // Ensure no custom themes are loaded
    const theme = themeManager.getTheme('NonExistentTheme');
    expect(theme).toBeUndefined();
  });

  it('should handle invalid theme file content gracefully', async () => {
    const themePath = '/home/user/themes/invalid-json.json';
    // Malformed JSON should cause load to fail and theme not to be registered
    const invalidContent = '{ "name": "Invalid Theme", "Background": ';

    // Mock file system for invalid JSON - don't use mockThemeFile helper as it stringifies
    const resolvedPath = path.resolve(themePath);
    vi.spyOn(fsPromises, 'realpath').mockImplementation(async (p) =>
      p === resolvedPath ? resolvedPath : (p as string),
    );
    vi.spyOn(fsPromises, 'readFile').mockImplementation(async (p) => {
      if (p === resolvedPath) {
        return invalidContent; // Return actual malformed JSON
      }
      throw new Error('File not found');
    });
    vi.spyOn(fsPromises, 'access').mockImplementation(async (p) => {
      if (p === resolvedPath) return undefined;
      throw new Error('File not found');
    });

    await themeManager.loadCustomThemes({
      InvalidJsonTheme: {
        path: themePath,
        type: 'custom',
        // Explicitly set name to match the key so getTheme can retrieve it
        // but the theme itself should be undefined due to invalid JSON.
        name: 'InvalidJsonTheme',
      },
    });
    // It should not be possible to retrieve the theme by its key or resolved name
    // Even if the theme name matches, the theme object itself should not be present.
    expect(themeManager.getTheme('InvalidJsonTheme')).toBeUndefined();
  });
  it('should update active theme correctly when switching to a custom theme', async () => {
    const themePath = '/home/user/themes/active-theme.json';
    const fileContent = { name: 'Active Custom Theme', Background: '#112233' };
    mockThemeFile(themePath, fileContent);

    await themeManager.loadCustomThemes({
      'active-key': { path: themePath, type: 'custom' },
    });

    themeManager.setActiveTheme('Active Custom Theme');
    const activeTheme = themeManager.getActiveTheme();
    expect(activeTheme).toBeDefined();
    expect(activeTheme.name).toBe('Active Custom Theme');
    expect(activeTheme.colors.Background).toBe('#112233');
  });

  it('should filter available themes correctly, including custom themes by their resolved name', async () => {
    const themePath = '/home/user/themes/test.json';
    mockThemeFile(themePath, { name: 'Test File Theme', Background: '#123' });

    await themeManager.loadCustomThemes({
      'inline-key': {
        type: 'custom',
        name: 'Inline Test Theme',
        Background: '#456',
      },
      'file-key': { path: themePath, type: 'custom' },
    });

    const availableThemes = themeManager.getAvailableThemes();
    const inlineTheme = availableThemes.find(
      (t) => t.name === 'Inline Test Theme',
    );
    const fileTheme = availableThemes.find((t) => t.name === 'Test File Theme');

    expect(inlineTheme).toBeDefined();
    expect(inlineTheme?.isCustom).toBe(true);
    expect(fileTheme).toBeDefined();
    expect(fileTheme?.isCustom).toBe(true);
  });
});
