/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThemeManager, type ThemeDisplay } from './theme-manager.js';
import * as fs from 'node:fs';
import * as os from 'node:os';

vi.mock('node:fs');
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

  it('should load custom themes from files', () => {
    const themePath = '/home/user/themes/my-theme.json';
    const themeContent = JSON.stringify({
      name: 'FileTheme',
      background: { primary: '#000000' },
    });

    vi.mocked(fs.realpathSync).mockReturnValue(themePath);
    vi.mocked(fs.readFileSync).mockReturnValue(themeContent);
    vi.mocked(fs.existsSync).mockReturnValue(true);

    themeManager.loadCustomThemeFiles([
      { name: 'My Custom Theme', path: themePath },
    ]);

    const themes = themeManager.getAvailableThemes();
    const customTheme = themes.find(
      (t: ThemeDisplay) => t.name === 'My Custom Theme',
    );

    expect(customTheme).toBeDefined();
    expect(customTheme?.isCustom).toBe(true);

    const theme = themeManager.getTheme('My Custom Theme');
    expect(theme).toBeDefined();
    expect(theme?.colors.Background).toBe('#000000');
  });

  it('should handle invalid theme files gracefully', () => {
    const themePath = '/home/user/themes/invalid.json';

    vi.mocked(fs.realpathSync).mockReturnValue(themePath);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File not found');
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);

    themeManager.loadCustomThemeFiles([
      { name: 'Invalid Theme', path: themePath },
    ]);

    const themes = themeManager.getAvailableThemes();
    const customTheme = themes.find(
      (t: ThemeDisplay) => t.name === 'Invalid Theme',
    );
    expect(customTheme).toBeUndefined();
  });

  it('should override theme name from settings', () => {
    const themePath = '/home/user/themes/named-theme.json';
    const themeContent = JSON.stringify({
      name: 'Original Name',
      background: { primary: '#FFFFFF' },
    });

    vi.mocked(fs.realpathSync).mockReturnValue(themePath);
    vi.mocked(fs.readFileSync).mockReturnValue(themeContent);
    vi.mocked(fs.existsSync).mockReturnValue(true);

    themeManager.loadCustomThemeFiles([{ name: 'New Name', path: themePath }]);

    const theme = themeManager.getTheme('New Name');
    expect(theme).toBeDefined();
    expect(theme?.name).toBe('New Name');

    // Original name should not be available
    const originalTheme = themeManager.getTheme('Original Name');
    expect(originalTheme).toBeUndefined(); // Unless it matches default or similar
  });

  it('should use name from file if not provided in settings', () => {
    const themePath = '/home/user/themes/unnamed-in-settings.json';
    const themeContent = JSON.stringify({
      name: 'Name From File',
      background: { primary: '#123456' },
    });

    vi.mocked(fs.realpathSync).mockReturnValue(themePath);
    vi.mocked(fs.readFileSync).mockReturnValue(themeContent);
    vi.mocked(fs.existsSync).mockReturnValue(true);

    themeManager.loadCustomThemeFiles([{ path: themePath }]);

    const theme = themeManager.getTheme('Name From File');
    expect(theme).toBeDefined();
    expect(theme?.name).toBe('Name From File');
    expect(themeManager.getThemeNameByPath(themePath)).toBe('Name From File');
  });
});
