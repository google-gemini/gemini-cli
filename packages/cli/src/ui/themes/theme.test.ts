/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as themeModule from './theme.js';
import { themeManager } from './theme-manager.js';

const { validateCustomTheme } = themeModule;
type CustomTheme = themeModule.CustomTheme;

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

    themeManager.loadCustomThemes({ 'Legacy Custom Theme': legacyTheme });
    const result = themeManager.getTheme('Legacy Custom Theme')!;

    expect(result.colors.DiffAdded).toBe(darkTheme.DiffAdded);
    expect(result.colors.DiffRemoved).toBe(darkTheme.DiffRemoved);
    expect(result.colors.AccentBlue).toBe(legacyTheme.AccentBlue);
    expect(result.name).toBe(legacyTheme.name);
  });
});
