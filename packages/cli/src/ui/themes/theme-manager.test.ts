/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Patch: Unset NO_COLOR at the very top before any imports
if (process.env['NO_COLOR'] !== undefined) {
  delete process.env['NO_COLOR'];
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { themeManager, DEFAULT_THEME } from './theme-manager.js';
import type { CustomTheme } from './theme.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import type * as osActual from 'node:os';
import { debugLogger } from '@google/gemini-cli-core';

vi.mock('node:fs');
vi.mock('node:os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof osActual>();
  return {
    ...actualOs,
    homedir: vi.fn(),
    platform: vi.fn(() => 'linux'),
  };
});

const validCustomTheme: CustomTheme = {
  type: 'custom',
  name: 'MyCustomTheme',
  Background: '#000000',
  Foreground: '#ffffff',
  LightBlue: '#89BDCD',
  AccentBlue: '#3B82F6',
  AccentPurple: '#8B5CF6',
  AccentCyan: '#06B6D4',
  AccentGreen: '#3CA84B',
  AccentYellow: 'yellow',
  AccentRed: 'red',
  DiffAdded: 'green',
  DiffRemoved: 'red',
  Comment: 'gray',
  Gray: 'gray',
};

describe('ThemeManager', () => {
  beforeEach(() => {
    // Reset themeManager state
    themeManager.loadCustomThemes({});
    themeManager.setActiveTheme(DEFAULT_THEME.name);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load valid custom themes', () => {
    themeManager.loadCustomThemes({ MyCustomTheme: validCustomTheme });
    expect(themeManager.getCustomThemeNames()).toContain('MyCustomTheme');
    expect(themeManager.isCustomTheme('MyCustomTheme')).toBe(true);
  });

  it('should set and get the active theme', () => {
    expect(themeManager.getActiveTheme().name).toBe(DEFAULT_THEME.name);
    themeManager.setActiveTheme('Ayu');
    expect(themeManager.getActiveTheme().name).toBe('Ayu');
  });

  it('should set and get a custom active theme', () => {
    themeManager.loadCustomThemes({ MyCustomTheme: validCustomTheme });
    themeManager.setActiveTheme('MyCustomTheme');
    expect(themeManager.getActiveTheme().name).toBe('MyCustomTheme');
  });

  it('should return false when setting a non-existent theme', () => {
    expect(themeManager.setActiveTheme('NonExistentTheme')).toBe(false);
    expect(themeManager.getActiveTheme().name).toBe(DEFAULT_THEME.name);
  });

  it('should list available themes including custom themes', () => {
    themeManager.loadCustomThemes({ MyCustomTheme: validCustomTheme });
    const available = themeManager.getAvailableThemes();
    expect(
      available.some(
        (t: { name: string; isCustom?: boolean }) =>
          t.name === 'MyCustomTheme' && t.isCustom,
      ),
    ).toBe(true);
  });

  it('should get a theme by name', () => {
    expect(themeManager.getTheme('Ayu')).toBeDefined();
    themeManager.loadCustomThemes({ MyCustomTheme: validCustomTheme });
    expect(themeManager.getTheme('MyCustomTheme')).toBeDefined();
  });

  it('should fall back to default theme if active theme is invalid', () => {
    (themeManager as unknown as { activeTheme: unknown }).activeTheme = {
      name: 'NonExistent',
      type: 'custom',
    };
    expect(themeManager.getActiveTheme().name).toBe(DEFAULT_THEME.name);
  });

  it('should return NoColorTheme if NO_COLOR is set', () => {
    const original = process.env['NO_COLOR'];
    process.env['NO_COLOR'] = '1';
    expect(themeManager.getActiveTheme().name).toBe('NoColor');
    if (original === undefined) {
      delete process.env['NO_COLOR'];
    } else {
      process.env['NO_COLOR'] = original;
    }
  });

  describe('when loading a theme from a file', () => {
    const mockThemePath = './my-theme.json';
    const mockTheme: CustomTheme = {
      ...validCustomTheme,
      name: 'My File Theme',
    };

    beforeEach(() => {
      vi.mocked(os.homedir).mockReturnValue('/home/user');
      vi.spyOn(fs, 'realpathSync').mockImplementation((p) => p as string);
    });

    it('should load a theme from a valid file path', () => {
      const themePath = '/home/user/my-theme.json';
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockTheme));

      // Load theme using new API
      themeManager.loadCustomThemes({
        MyFileTheme: {
          path: themePath,
          type: 'custom',
        },
      });

      // Set it as active
      const result = themeManager.setActiveTheme('My File Theme');

      expect(result).toBe(true);
      const activeTheme = themeManager.getActiveTheme();
      expect(activeTheme.name).toBe('My File Theme');
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('my-theme.json'),
        'utf-8',
      );
    });

    it('should not load a theme if the file does not exist', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      // Try to load non-existent file
      themeManager.loadCustomThemes({
        NonExistentFileTheme: {
          path: mockThemePath,
          type: 'custom',
        },
      });

      const result = themeManager.setActiveTheme('NonExistentFileTheme');

      expect(result).toBe(false);
      expect(themeManager.getActiveTheme().name).toBe(DEFAULT_THEME.name);
    });

    it('should not load a theme from a file with invalid JSON', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('invalid json');

      // Try to load invalid JSON file
      themeManager.loadCustomThemes({
        InvalidJsonFileTheme: {
          path: mockThemePath,
          type: 'custom',
        },
      });

      const result = themeManager.setActiveTheme('InvalidJsonFileTheme');

      expect(result).toBe(false);
      expect(themeManager.getActiveTheme().name).toBe(DEFAULT_THEME.name);
    });

    it('should not load a theme from an untrusted file path and log a message', () => {
      const untrustedPath = '/untrusted/my-theme.json';
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockTheme));
      vi.spyOn(fs, 'realpathSync').mockReturnValue(untrustedPath);
      const consoleWarnSpy = vi
        .spyOn(debugLogger, 'warn')
        .mockImplementation(() => {});

      // Use loadCustomThemes instead of setActiveTheme, as that's the new API
      themeManager.loadCustomThemes({
        UntrustedTheme: {
          path: untrustedPath,
          type: 'custom',
          name: 'My File Theme',
        },
      });

      // The theme should not be loaded due to security check
      expect(themeManager.getTheme('My File Theme')).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('is outside your home directory'),
      );

      consoleWarnSpy.mockRestore();
    });
  });
});
