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
import type { CustomTheme } from '@google/gemini-cli-core';
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

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    homedir: () => os.homedir(),
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
    themeManager.setTerminalBackground(undefined);
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
        .spyOn(debugLogger, 'warn')
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

  describe('extension themes', () => {
    it('should register and unregister themes from extensions with namespacing', () => {
      const extTheme: CustomTheme = {
        ...validCustomTheme,
        name: 'ExtensionTheme',
      };
      const extensionName = 'test-extension';
      const namespacedName = `ExtensionTheme (${extensionName})`;

      themeManager.registerExtensionThemes(extensionName, [extTheme]);
      expect(themeManager.getCustomThemeNames()).toContain(namespacedName);
      expect(themeManager.isCustomTheme(namespacedName)).toBe(true);

      themeManager.unregisterExtensionThemes(extensionName, [extTheme]);
      expect(themeManager.getCustomThemeNames()).not.toContain(namespacedName);
      expect(themeManager.isCustomTheme(namespacedName)).toBe(false);
    });

    it('should not allow extension themes to overwrite built-in themes even with prefixing', () => {
      // availableThemes has 'Ayu'.
      // We verify that it DOES prefix, so it won't collide even if extension name is similar.
      themeManager.registerExtensionThemes('Ext', [
        { ...validCustomTheme, name: 'Theme' },
      ]);
      expect(themeManager.getCustomThemeNames()).toContain('Theme (Ext)');
    });

    it('should allow extension themes and settings themes to coexist', () => {
      const extTheme: CustomTheme = {
        ...validCustomTheme,
        name: 'ExtensionTheme',
      };
      const settingsTheme: CustomTheme = {
        ...validCustomTheme,
        name: 'SettingsTheme',
      };

      themeManager.registerExtensionThemes('Ext', [extTheme]);
      themeManager.loadCustomThemes({ SettingsTheme: settingsTheme });

      expect(themeManager.getCustomThemeNames()).toContain(
        'ExtensionTheme (Ext)',
      );
      expect(themeManager.getCustomThemeNames()).toContain('SettingsTheme');

      expect(themeManager.isCustomTheme('ExtensionTheme (Ext)')).toBe(true);
      expect(themeManager.isCustomTheme('SettingsTheme')).toBe(true);
    });
  });

  describe('terminalBackground override', () => {
    it('should store and retrieve terminal background', () => {
      themeManager.setTerminalBackground('#123456');
      expect(themeManager.getTerminalBackground()).toBe('#123456');
      themeManager.setTerminalBackground(undefined);
      expect(themeManager.getTerminalBackground()).toBeUndefined();
    });

    it('should override background.primary in semantic colors when terminal background is set', () => {
      const color = '#1a1a1a';
      themeManager.setTerminalBackground(color);
      const semanticColors = themeManager.getSemanticColors();
      expect(semanticColors.background.primary).toBe(color);
    });

    it('should override Background in colors when terminal background is set', () => {
      const color = '#1a1a1a';
      themeManager.setTerminalBackground(color);
      const colors = themeManager.getColors();
      expect(colors.Background).toBe(color);
    });

    it('should re-calculate dependent semantic colors when terminal background is set', () => {
      themeManager.setTerminalBackground('#000000');
      const semanticColors = themeManager.getSemanticColors();

      // border.default should be interpolated from background (#000000) and Gray
      // ui.dark should be interpolated from Gray and background (#000000)
      expect(semanticColors.border.default).toBeDefined();
      expect(semanticColors.ui.dark).toBeDefined();
      expect(semanticColors.border.default).not.toBe(
        DEFAULT_THEME.semanticColors.border.default,
      );
    });

    it('should return original semantic colors when terminal background is NOT set', () => {
      themeManager.setTerminalBackground(undefined);
      const semanticColors = themeManager.getSemanticColors();
      expect(semanticColors).toEqual(DEFAULT_THEME.semanticColors);
    });

    it('should NOT override background when theme is incompatible (Light theme on Dark terminal)', () => {
      themeManager.setActiveTheme('Default Light');
      const darkTerminalBg = '#000000';
      themeManager.setTerminalBackground(darkTerminalBg);

      const semanticColors = themeManager.getSemanticColors();
      expect(semanticColors.background.primary).toBe(
        themeManager.getTheme('Default Light')!.colors.Background,
      );

      const colors = themeManager.getColors();
      expect(colors.Background).toBe(
        themeManager.getTheme('Default Light')!.colors.Background,
      );
    });

    it('should NOT override background when theme is incompatible (Dark theme on Light terminal)', () => {
      themeManager.setActiveTheme('Default');
      const lightTerminalBg = '#FFFFFF';
      themeManager.setTerminalBackground(lightTerminalBg);

      const semanticColors = themeManager.getSemanticColors();
      expect(semanticColors.background.primary).toBe(
        themeManager.getTheme('Default')!.colors.Background,
      );

      const colors = themeManager.getColors();
      expect(colors.Background).toBe(
        themeManager.getTheme('Default')!.colors.Background,
      );
    });

    it('should override background for custom theme when compatible', () => {
      themeManager.loadCustomThemes({
        MyDark: {
          name: 'MyDark',
          type: 'custom',
          Background: '#000000',
          Foreground: '#ffffff',
        },
      });
      themeManager.setActiveTheme('MyDark');

      const darkTerminalBg = '#1a1a1a';
      themeManager.setTerminalBackground(darkTerminalBg);

      const semanticColors = themeManager.getSemanticColors();
      expect(semanticColors.background.primary).toBe(darkTerminalBg);
    });

    it('should NOT override background for custom theme when incompatible', () => {
      themeManager.loadCustomThemes({
        MyLight: {
          name: 'MyLight',
          type: 'custom',
          Background: '#ffffff',
          Foreground: '#000000',
        },
      });
      themeManager.setActiveTheme('MyLight');

      const darkTerminalBg = '#000000';
      themeManager.setTerminalBackground(darkTerminalBg);

      const semanticColors = themeManager.getSemanticColors();
      expect(semanticColors.background.primary).toBe('#ffffff');
    });
  });
});
