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
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import type * as osActual from 'node:os';
import { debugLogger } from '@google/gemini-cli-core';

vi.mock('node:fs');
vi.mock('node:fs/promises');
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
  beforeEach(async () => {
    // Reset themeManager state
    await themeManager.loadCustomThemes({});
    themeManager.setActiveTheme(DEFAULT_THEME.name);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load valid custom themes', async () => {
    await themeManager.loadCustomThemes({ MyCustomTheme: validCustomTheme });
    expect(themeManager.getCustomThemeNames()).toContain('MyCustomTheme');
    expect(themeManager.isCustomTheme('MyCustomTheme')).toBe(true);
  });

  it('should set and get the active theme', () => {
    expect(themeManager.getActiveTheme().name).toBe(DEFAULT_THEME.name);
    themeManager.setActiveTheme('Ayu');
    expect(themeManager.getActiveTheme().name).toBe('Ayu');
  });

  it('should set and get a custom active theme', async () => {
    await themeManager.loadCustomThemes({ MyCustomTheme: validCustomTheme });
    themeManager.setActiveTheme('MyCustomTheme');
    expect(themeManager.getActiveTheme().name).toBe('MyCustomTheme');
  });

  it('should return false when setting a non-existent theme', () => {
    expect(themeManager.setActiveTheme('NonExistentTheme')).toBe(false);
    expect(themeManager.getActiveTheme().name).toBe(DEFAULT_THEME.name);
  });

  it('should list available themes including custom themes', async () => {
    await themeManager.loadCustomThemes({ MyCustomTheme: validCustomTheme });
    const available = themeManager.getAvailableThemes();
    expect(
      available.some(
        (t: { name: string; isCustom?: boolean }) =>
          t.name === 'MyCustomTheme' && t.isCustom,
      ),
    ).toBe(true);
  });

  it('should get a theme by name', async () => {
    expect(themeManager.getTheme('Ayu')).toBeDefined();
    await themeManager.loadCustomThemes({ MyCustomTheme: validCustomTheme });
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
      vi.spyOn(fsPromises, 'realpath').mockImplementation(
        async (p) => p as string,
      );
    });

    it('should load a theme from a valid file path', async () => {
      const themePath = '/home/user/my-theme.json';
      vi.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
      vi.spyOn(fsPromises, 'readFile').mockResolvedValue(
        JSON.stringify(mockTheme),
      );

      await themeManager.loadCustomThemes({
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
      expect(fsPromises.readFile).toHaveBeenCalledWith(
        expect.stringContaining('my-theme.json'),
        'utf-8',
      );
    });

    it('should not load a theme if the file does not exist', async () => {
      vi.spyOn(fsPromises, 'access').mockRejectedValue(new Error('ENOENT'));

      // Try to load non-existent file
      await themeManager.loadCustomThemes({
        NonExistentFileTheme: {
          path: mockThemePath,
          type: 'custom',
        },
      });

      const result = themeManager.setActiveTheme('NonExistentFileTheme');

      expect(result).toBe(false);
      expect(themeManager.getActiveTheme().name).toBe(DEFAULT_THEME.name);
    });

    it('should not load a theme from a file with invalid JSON', async () => {
      vi.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
      vi.spyOn(fsPromises, 'readFile').mockResolvedValue('invalid json');

      // Try to load invalid JSON file
      await themeManager.loadCustomThemes({
        InvalidJsonFileTheme: {
          path: mockThemePath,
          type: 'custom',
        },
      });

      const result = themeManager.setActiveTheme('InvalidJsonFileTheme');

      expect(result).toBe(false);
      expect(themeManager.getActiveTheme().name).toBe(DEFAULT_THEME.name);
    });

    it('should not load a theme from an untrusted file path and log a message', async () => {
      const untrustedPath = '/untrusted/my-theme.json';
      vi.spyOn(fsPromises, 'access').mockResolvedValue(undefined);
      vi.spyOn(fsPromises, 'readFile').mockResolvedValue(
        JSON.stringify(mockTheme),
      );
      vi.spyOn(fsPromises, 'realpath').mockResolvedValue(untrustedPath);
      const consoleWarnSpy = vi
        .spyOn(debugLogger, 'warn')
        .mockImplementation(() => {});

      // Use loadCustomThemes instead of setActiveTheme, as that's the new API
      await themeManager.loadCustomThemes({
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
