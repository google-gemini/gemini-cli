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
import { AUTO_THEME } from './theme.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import type * as osActual from 'node:os';

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
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockTheme));

      const result = themeManager.setActiveTheme('/home/user/my-theme.json');

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

      const result = themeManager.setActiveTheme(mockThemePath);

      expect(result).toBe(false);
      expect(themeManager.getActiveTheme().name).toBe(DEFAULT_THEME.name);
    });

    it('should not load a theme from a file with invalid JSON', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('invalid json');

      const result = themeManager.setActiveTheme(mockThemePath);

      expect(result).toBe(false);
      expect(themeManager.getActiveTheme().name).toBe(DEFAULT_THEME.name);
    });

    it('should not load a theme from an untrusted file path and log a message', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockTheme));
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const result = themeManager.setActiveTheme('/untrusted/my-theme.json');

      expect(result).toBe(false);
      expect(themeManager.getActiveTheme().name).toBe(DEFAULT_THEME.name);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('is outside your home directory'),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Auto theme functionality', () => {
    describe('setActiveTheme with AUTO_THEME', () => {
      it('should set light theme when terminal is light', () => {
        const result = themeManager.setActiveTheme(AUTO_THEME, 'light', {
          light: 'Default Light',
          dark: 'Default',
        });

        expect(result).toBe(true);
        expect(themeManager.getActiveTheme().name).toBe('Default Light');
        expect(themeManager.getActiveTheme().type).toBe('light');
      });

      it('should set dark theme when terminal is dark', () => {
        const result = themeManager.setActiveTheme(AUTO_THEME, 'dark', {
          light: 'Default Light',
          dark: 'Default',
        });

        expect(result).toBe(true);
        expect(themeManager.getActiveTheme().name).toBe('Default');
        expect(themeManager.getActiveTheme().type).toBe('dark');
      });

      it('should fall back to dark theme when terminal is unknown', () => {
        const result = themeManager.setActiveTheme(AUTO_THEME, 'unknown', {
          light: 'Default Light',
          dark: 'Default',
        });

        expect(result).toBe(true);
        expect(themeManager.getActiveTheme().name).toBe('Default');
      });

      it('should use custom theme preferences for light terminal', () => {
        const result = themeManager.setActiveTheme(AUTO_THEME, 'light', {
          light: 'GitHub Light',
          dark: 'Dracula',
        });

        expect(result).toBe(true);
        expect(themeManager.getActiveTheme().name).toBe('GitHub Light');
      });

      it('should use custom theme preferences for dark terminal', () => {
        const result = themeManager.setActiveTheme(AUTO_THEME, 'dark', {
          light: 'GitHub Light',
          dark: 'Dracula',
        });

        expect(result).toBe(true);
        expect(themeManager.getActiveTheme().name).toBe('Dracula');
      });

      it('should use default preferences if not provided', () => {
        const result = themeManager.setActiveTheme(AUTO_THEME, 'light');

        expect(result).toBe(true);
        expect(themeManager.getActiveTheme().name).toBe('Default Light');
      });

      it('should fall back to built-in theme if preferred theme not found', () => {
        const result = themeManager.setActiveTheme(AUTO_THEME, 'light', {
          light: 'NonExistentTheme',
          dark: 'Default',
        });

        expect(result).toBe(true);
        expect(themeManager.getActiveTheme().name).toBe('Default Light');
      });

      it('should return false if both preferred and fallback themes not found', () => {
        // This is an edge case - should never happen in practice
        const result = themeManager.setActiveTheme(AUTO_THEME, 'light', {
          light: 'NonExistent1',
          dark: 'NonExistent2',
        });

        // Should still succeed by falling back to built-in defaults
        expect(result).toBe(true);
      });

      it('should handle missing terminalBackground parameter', () => {
        const result = themeManager.setActiveTheme(AUTO_THEME);

        expect(result).toBe(true);
        // Should default to dark theme
        expect(themeManager.getActiveTheme().name).toBe('Default');
      });
    });

    describe('isAutoTheme', () => {
      it('should return true for AUTO_THEME constant', () => {
        expect(themeManager.isAutoTheme(AUTO_THEME)).toBe(true);
      });

      it('should return true for "auto" string', () => {
        expect(themeManager.isAutoTheme('auto')).toBe(true);
      });

      it('should return false for other theme names', () => {
        expect(themeManager.isAutoTheme('Default')).toBe(false);
        expect(themeManager.isAutoTheme('Default Light')).toBe(false);
        expect(themeManager.isAutoTheme('Dracula')).toBe(false);
      });

      it('should return false for undefined', () => {
        expect(themeManager.isAutoTheme(undefined)).toBe(false);
      });

      it('should return false for empty string', () => {
        expect(themeManager.isAutoTheme('')).toBe(false);
      });

      it('should be case-sensitive', () => {
        expect(themeManager.isAutoTheme('Auto')).toBe(false);
        expect(themeManager.isAutoTheme('AUTO')).toBe(false);
      });
    });

    describe('resolveAutoThemeName', () => {
      it('should resolve to light theme for light terminal', () => {
        const resolved = themeManager.resolveAutoThemeName('light', {
          light: 'GitHub Light',
          dark: 'Dracula',
        });

        expect(resolved).toBe('GitHub Light');
      });

      it('should resolve to dark theme for dark terminal', () => {
        const resolved = themeManager.resolveAutoThemeName('dark', {
          light: 'GitHub Light',
          dark: 'Dracula',
        });

        expect(resolved).toBe('Dracula');
      });

      it('should resolve to dark theme for unknown terminal', () => {
        const resolved = themeManager.resolveAutoThemeName('unknown', {
          light: 'GitHub Light',
          dark: 'Dracula',
        });

        expect(resolved).toBe('Dracula');
      });

      it('should use default light theme if preferences not provided', () => {
        const resolved = themeManager.resolveAutoThemeName('light');

        expect(resolved).toBe('Default Light');
      });

      it('should use default dark theme if preferences not provided', () => {
        const resolved = themeManager.resolveAutoThemeName('dark');

        expect(resolved).toBe('Default');
      });

      it('should use default dark theme for unknown terminal without preferences', () => {
        const resolved = themeManager.resolveAutoThemeName('unknown');

        expect(resolved).toBe('Default');
      });

      it('should respect custom light theme preference', () => {
        const resolved = themeManager.resolveAutoThemeName('light', {
          light: 'Ayu Light',
          dark: 'Ayu',
        });

        expect(resolved).toBe('Ayu Light');
      });

      it('should respect custom dark theme preference', () => {
        const resolved = themeManager.resolveAutoThemeName('dark', {
          light: 'Ayu Light',
          dark: 'Ayu',
        });

        expect(resolved).toBe('Ayu');
      });

      it('should handle partial preferences (only light)', () => {
        const resolved = themeManager.resolveAutoThemeName('dark', {
          light: 'GitHub Light',
          dark: undefined as unknown as string,
        });

        expect(resolved).toBe('Default');
      });

      it('should handle partial preferences (only dark)', () => {
        const resolved = themeManager.resolveAutoThemeName('light', {
          light: undefined as unknown as string,
          dark: 'Dracula',
        });

        expect(resolved).toBe('Default Light');
      });
    });

    describe('Auto theme with custom themes', () => {
      beforeEach(() => {
        const customLightTheme: CustomTheme = {
          ...validCustomTheme,
          name: 'My Light Theme',
          type: 'custom',
          Background: '#ffffff',
          Foreground: '#000000',
        };

        const customDarkTheme: CustomTheme = {
          ...validCustomTheme,
          name: 'My Dark Theme',
          type: 'custom',
        };

        themeManager.loadCustomThemes({
          'My Light Theme': customLightTheme,
          'My Dark Theme': customDarkTheme,
        });
      });

      it('should work with custom light theme preference', () => {
        const result = themeManager.setActiveTheme(AUTO_THEME, 'light', {
          light: 'My Light Theme',
          dark: 'My Dark Theme',
        });

        expect(result).toBe(true);
        expect(themeManager.getActiveTheme().name).toBe('My Light Theme');
      });

      it('should work with custom dark theme preference', () => {
        const result = themeManager.setActiveTheme(AUTO_THEME, 'dark', {
          light: 'My Light Theme',
          dark: 'My Dark Theme',
        });

        expect(result).toBe(true);
        expect(themeManager.getActiveTheme().name).toBe('My Dark Theme');
      });

      it('should resolve custom theme names correctly', () => {
        const resolved = themeManager.resolveAutoThemeName('light', {
          light: 'My Light Theme',
          dark: 'My Dark Theme',
        });

        expect(resolved).toBe('My Light Theme');
      });
    });

    describe('AUTO_THEME constant', () => {
      it('should be the string "auto"', () => {
        expect(AUTO_THEME).toBe('auto');
      });

      it('should work with setActiveTheme', () => {
        const result = themeManager.setActiveTheme(AUTO_THEME, 'dark');
        expect(result).toBe(true);
      });

      it('should work with isAutoTheme', () => {
        expect(themeManager.isAutoTheme(AUTO_THEME)).toBe(true);
      });
    });

    describe('Edge cases', () => {
      it('should handle empty theme preferences object', () => {
        const result = themeManager.setActiveTheme(
          AUTO_THEME,
          'light',
          {} as { light: string; dark: string },
        );

        expect(result).toBe(true);
        expect(themeManager.getActiveTheme().name).toBe('Default Light');
      });

      it('should handle null theme preferences', () => {
        const result = themeManager.setActiveTheme(
          AUTO_THEME,
          'light',
          null as unknown as { light: string; dark: string },
        );

        expect(result).toBe(true);
        expect(themeManager.getActiveTheme().name).toBe('Default Light');
      });

      it('should handle undefined theme preferences', () => {
        const result = themeManager.setActiveTheme(
          AUTO_THEME,
          'light',
          undefined,
        );

        expect(result).toBe(true);
        expect(themeManager.getActiveTheme().name).toBe('Default Light');
      });

      it('should not confuse AUTO_THEME with a theme named "auto"', () => {
        // Even if someone creates a theme named "auto", AUTO_THEME should trigger auto-detection
        const result = themeManager.setActiveTheme(AUTO_THEME, 'dark');
        expect(result).toBe(true);
        expect(themeManager.getActiveTheme().name).toBe('Default');
      });
    });
  });
});
