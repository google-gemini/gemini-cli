/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Patch: Unset NO_COLOR at the very top before any imports
if (process.env.NO_COLOR !== undefined) {
  delete process.env.NO_COLOR;
}

import { describe, it, expect, beforeEach } from 'vitest';
import { ThemeManager, DEFAULT_THEME } from './theme-manager.js';
import { CustomTheme } from './theme.js';

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
  AccentYellow: '#D5A40A',
  AccentRed: '#DD4C4C',
  Comment: '#008000',
  Gray: '#B7BECC',
};

describe('ThemeManager', () => {
  beforeEach(() => {
    // Reset themeManager state
    ThemeManager.resetInstance();
    ThemeManager.getInstance().loadCustomThemes({});
    ThemeManager.getInstance().setActiveTheme(DEFAULT_THEME.name);
  });

  it('should load valid custom themes', () => {
    ThemeManager.getInstance().loadCustomThemes({
      MyCustomTheme: validCustomTheme,
    });
    expect(ThemeManager.getInstance().getCustomThemeNames()).toContain(
      'MyCustomTheme',
    );
    expect(ThemeManager.getInstance().isCustomTheme('MyCustomTheme')).toBe(
      true,
    );
  });

  it('should not load invalid custom themes', () => {
    const invalidTheme = { ...validCustomTheme, Background: 'not-a-color' };
    ThemeManager.getInstance().loadCustomThemes({
      InvalidTheme: invalidTheme as unknown as CustomTheme,
    });
    expect(ThemeManager.getInstance().getCustomThemeNames()).not.toContain(
      'InvalidTheme',
    );
    expect(ThemeManager.getInstance().isCustomTheme('InvalidTheme')).toBe(
      false,
    );
  });

  it('should set and get the active theme', () => {
    expect(ThemeManager.getInstance().getActiveTheme().name).toBe(
      DEFAULT_THEME.name,
    );
    ThemeManager.getInstance().setActiveTheme('Ayu');
    expect(ThemeManager.getInstance().getActiveTheme().name).toBe('Ayu');
  });

  it('should set and get a custom active theme', () => {
    ThemeManager.getInstance().loadCustomThemes({
      MyCustomTheme: validCustomTheme,
    });
    ThemeManager.getInstance().setActiveTheme('MyCustomTheme');
    expect(ThemeManager.getInstance().getActiveTheme().name).toBe(
      'MyCustomTheme',
    );
  });

  it('should return false when setting a non-existent theme', () => {
    expect(ThemeManager.getInstance().setActiveTheme('NonExistentTheme')).toBe(
      false,
    );
    expect(ThemeManager.getInstance().getActiveTheme().name).toBe(
      DEFAULT_THEME.name,
    );
  });

  it('should list available themes including custom themes', () => {
    ThemeManager.getInstance().loadCustomThemes({
      MyCustomTheme: validCustomTheme,
    });
    const available = ThemeManager.getInstance().getAvailableThemes();
    expect(
      available.some(
        (t: { name: string; isCustom?: boolean }) =>
          t.name === 'MyCustomTheme' && t.isCustom,
      ),
    ).toBe(true);
  });

  it('should get a theme by name', () => {
    expect(ThemeManager.getInstance().getTheme('Ayu')).toBeDefined();
    ThemeManager.getInstance().loadCustomThemes({
      MyCustomTheme: validCustomTheme,
    });
    expect(ThemeManager.getInstance().getTheme('MyCustomTheme')).toBeDefined();
  });

  it('should fall back to default theme if active theme is invalid', () => {
    (
      ThemeManager.getInstance() as unknown as { activeTheme: unknown }
    ).activeTheme = {
      name: 'NonExistent',
      type: 'custom',
    };
    expect(ThemeManager.getInstance().getActiveTheme().name).toBe(
      DEFAULT_THEME.name,
    );
  });

  it('should return NoColorTheme if NO_COLOR is set', () => {
    const original = process.env.NO_COLOR;
    process.env.NO_COLOR = '1';
    expect(ThemeManager.getInstance().getActiveTheme().name).toBe('NoColor');
    if (original === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = original;
    }
  });
});
