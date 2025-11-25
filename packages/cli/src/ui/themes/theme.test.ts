/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as themeModule from './theme.js';
import { themeManager } from './theme-manager.js';

const { validateCustomTheme, createCustomTheme } = themeModule;
type CustomTheme = themeModule.CustomTheme;

describe('createCustomTheme', () => {
  const baseTheme: CustomTheme = {
    type: 'custom',
    name: 'Test Theme',
    Background: '#000000',
    Foreground: '#ffffff',
    LightBlue: '#ADD8E6',
    AccentBlue: '#0000FF',
    AccentPurple: '#800080',
    AccentCyan: '#00FFFF',
    AccentGreen: '#008000',
    AccentYellow: '#FFFF00',
    AccentRed: '#FF0000',
    DiffAdded: '#00FF00',
    DiffRemoved: '#FF0000',
    Comment: '#808080',
    Gray: '#cccccc',
    // DarkGray intentionally omitted to test fallback
  };

  it('should interpolate DarkGray when not provided', () => {
    const theme = createCustomTheme(baseTheme);
    // Interpolate between Gray (#cccccc) and Background (#000000) at 0.5
    // #cccccc is RGB(204, 204, 204)
    // #000000 is RGB(0, 0, 0)
    // Midpoint is RGB(102, 102, 102) which is #666666
    expect(theme.colors.DarkGray).toBe('#666666');
  });

  it('should use provided DarkGray', () => {
    const theme = createCustomTheme({
      ...baseTheme,
      DarkGray: '#123456',
    });
    expect(theme.colors.DarkGray).toBe('#123456');
  });

  it('should interpolate DarkGray when text.secondary is provided but DarkGray is not', () => {
    const customTheme: CustomTheme = {
      type: 'custom',
      name: 'Test',
      text: {
        secondary: '#cccccc', // Gray source
      },
      background: {
        primary: '#000000', // Background source
      },
    };
    const theme = createCustomTheme(customTheme);
    // Should be interpolated between #cccccc and #000000 at 0.5 -> #666666
    expect(theme.colors.DarkGray).toBe('#666666');
  });

  it('should prefer text.secondary over Gray for interpolation', () => {
    const customTheme: CustomTheme = {
      type: 'custom',
      name: 'Test',
      text: {
        secondary: '#cccccc', // Should be used
      },
      Gray: '#aaaaaa', // Should be ignored
      background: {
        primary: '#000000',
      },
    };
    const theme = createCustomTheme(customTheme);
    // Interpolate between #cccccc and #000000 -> #666666
    expect(theme.colors.DarkGray).toBe('#666666');
  });
});

describe('validateCustomTheme', () => {
  const validTheme: CustomTheme = {
    type: 'custom',
    name: 'My Custom Theme',
    Background: '#FFFFFF',
    Foreground: '#000000',
    LightBlue: '#ADD8E6',
    AccentBlue: '#0000FF',
    AccentPurple: '#800080',
    AccentCyan: '#00FFFF',
    AccentGreen: '#008000',
    AccentYellow: '#FFFF00',
    AccentRed: '#FF0000',
    DiffAdded: '#00FF00',
    DiffRemoved: '#FF0000',
    Comment: '#808080',
    Gray: '#808080',
  };

  it('should return isValid: true for a valid theme', () => {
    const result = validateCustomTheme(validTheme);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should return isValid: false for a theme with an invalid name', () => {
    const invalidTheme = { ...validTheme, name: ' ' };
    const result = validateCustomTheme(invalidTheme);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid theme name:  ');
  });

  it('should return isValid: true for a theme missing optional DiffAdded and DiffRemoved colors', () => {
    const legacyTheme: Partial<CustomTheme> = { ...validTheme };
    delete legacyTheme.DiffAdded;
    delete legacyTheme.DiffRemoved;
    const result = validateCustomTheme(legacyTheme);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should return isValid: false for a theme with a very long name', () => {
    const invalidTheme = { ...validTheme, name: 'a'.repeat(51) };
    const result = validateCustomTheme(invalidTheme);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe(`Invalid theme name: ${'a'.repeat(51)}`);
  });
});

describe('themeManager.loadCustomThemes', () => {
  const baseTheme: Omit<CustomTheme, 'DiffAdded' | 'DiffRemoved'> & {
    DiffAdded?: string;
    DiffRemoved?: string;
  } = {
    type: 'custom',
    name: 'Test Theme',
    Background: '#FFF',
    Foreground: '#000',
    LightBlue: '#ADD8E6',
    AccentBlue: '#00F',
    AccentPurple: '#808',
    AccentCyan: '#0FF',
    AccentGreen: '#080',
    AccentYellow: '#FF0',
    AccentRed: '#F00',
    Comment: '#888',
    Gray: '#888',
  };

  it('should use values from DEFAULT_THEME when DiffAdded and DiffRemoved are not provided', () => {
    const { darkTheme } = themeModule;
    const legacyTheme: Partial<CustomTheme> = { ...baseTheme };
    delete legacyTheme.DiffAdded;
    delete legacyTheme.DiffRemoved;

    themeManager.loadCustomThemes({
      'Legacy Custom Theme': legacyTheme as CustomTheme,
    });
    const result = themeManager.getTheme('Legacy Custom Theme')!;

    expect(result.colors.DiffAdded).toBe(darkTheme.DiffAdded);
    expect(result.colors.DiffRemoved).toBe(darkTheme.DiffRemoved);
    expect(result.colors.AccentBlue).toBe(legacyTheme.AccentBlue);
    expect(result.name).toBe(legacyTheme.name);
  });
});
