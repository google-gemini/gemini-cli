/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  Theme,
  ThemeType,
  CustomTheme,
  createCustomTheme,
  validateCustomTheme,
  createDefaultCustomTheme,
} from './theme.js';

describe('Custom Theme Functionality', () => {
  it('should create a valid custom theme', () => {
    const customTheme: CustomTheme = {
      type: 'custom',
      name: 'Test Theme',
      Background: '#1a1a1a',
      Foreground: '#ffffff',
      LightBlue: '#89b4fa',
      AccentBlue: '#3b82f6',
      AccentPurple: '#8b5cf6',
      AccentCyan: '#06b6d4',
      AccentGreen: '#10b981',
      AccentYellow: '#f59e0b',
      AccentRed: '#ef4444',
      Comment: '#6b7280',
      Gray: '#9ca3af',
      GradientColors: ['#3b82f6', '#8b5cf6', '#06b6d4'],
    };

    const validation = validateCustomTheme(customTheme);
    expect(validation.isValid).toBe(true);
    expect(validation.error).toBeUndefined();
  });

  it('should create a Theme instance from custom theme', () => {
    const customTheme: CustomTheme = {
      type: 'custom',
      name: 'Test Theme',
      Background: '#1a1a1a',
      Foreground: '#ffffff',
      LightBlue: '#89b4fa',
      AccentBlue: '#3b82f6',
      AccentPurple: '#8b5cf6',
      AccentCyan: '#06b6d4',
      AccentGreen: '#10b981',
      AccentYellow: '#f59e0b',
      AccentRed: '#ef4444',
      Comment: '#6b7280',
      Gray: '#9ca3af',
    };

    const theme = createCustomTheme(customTheme);
    expect(theme).toBeInstanceOf(Theme);
    expect(theme.name).toBe('Test Theme');
    expect(theme.type).toBe('custom');
  });

  it('should validate custom theme with missing fields', () => {
    const invalidTheme = {
      type: 'custom' as const,
      name: 'Test Theme',
      Background: '#1a1a1a',
      // Missing other required fields
    };

    const validation = validateCustomTheme(invalidTheme);
    expect(validation.isValid).toBe(false);
    expect(validation.error).toContain('Missing required field');
  });

  it('should validate custom theme with invalid colors', () => {
    const invalidTheme: CustomTheme = {
      type: 'custom',
      name: 'Test Theme',
      Background: 'invalid-color',
      Foreground: '#ffffff',
      LightBlue: '#89b4fa',
      AccentBlue: '#3b82f6',
      AccentPurple: '#8b5cf6',
      AccentCyan: '#06b6d4',
      AccentGreen: '#10b981',
      AccentYellow: '#f59e0b',
      AccentRed: '#ef4444',
      Comment: '#6b7280',
      Gray: '#9ca3af',
    };

    const validation = validateCustomTheme(invalidTheme);
    expect(validation.isValid).toBe(false);
    expect(validation.error).toContain('Invalid color format');
  });

  it('should accept CSS color names in custom themes', () => {
    const customThemeWithCssColors: CustomTheme = {
      type: 'custom',
      name: 'CSS Colors Theme',
      Background: 'darkkhaki',
      Foreground: 'whitesmoke',
      LightBlue: 'lightblue',
      AccentBlue: 'cornflowerblue',
      AccentPurple: 'mediumpurple',
      AccentCyan: 'turquoise',
      AccentGreen: 'forestgreen',
      AccentYellow: 'goldenrod',
      AccentRed: 'tomato',
      Comment: 'gray',
      Gray: 'silver',
    };

    const validation = validateCustomTheme(customThemeWithCssColors);
    expect(validation.isValid).toBe(true);
    expect(validation.error).toBeUndefined();

    // Verify that the theme can be created successfully
    const theme = createCustomTheme(customThemeWithCssColors);
    expect(theme).toBeInstanceOf(Theme);
    expect(theme.name).toBe('CSS Colors Theme');
    expect(theme.type).toBe('custom');
  });

  it('should accept mixed hex and CSS color names in custom themes', () => {
    const mixedTheme: CustomTheme = {
      type: 'custom',
      name: 'Mixed Colors Theme',
      Background: '#1a1a1a',
      Foreground: 'whitesmoke',
      LightBlue: 'lightblue',
      AccentBlue: '#3b82f6',
      AccentPurple: 'mediumpurple',
      AccentCyan: 'turquoise',
      AccentGreen: '#10b981',
      AccentYellow: 'goldenrod',
      AccentRed: 'tomato',
      Comment: 'gray',
      Gray: '#9ca3af',
    };

    const validation = validateCustomTheme(mixedTheme);
    expect(validation.isValid).toBe(true);
    expect(validation.error).toBeUndefined();
  });

  it('should create default custom theme from light base', () => {
    const customTheme = createDefaultCustomTheme('Light Custom', 'light');
    expect(customTheme.type).toBe('custom');
    expect(customTheme.name).toBe('Light Custom');
    expect(customTheme.Background).toBe('#FAFAFA'); // From lightTheme
    expect(customTheme.Foreground).toBe('#3C3C43'); // From lightTheme
  });

  it('should create default custom theme from dark base', () => {
    const customTheme = createDefaultCustomTheme('Dark Custom', 'dark');
    expect(customTheme.type).toBe('custom');
    expect(customTheme.name).toBe('Dark Custom');
    expect(customTheme.Background).toBe('#1E1E2E'); // From darkTheme
    expect(customTheme.Foreground).toBe('#CDD6F4'); // From darkTheme
  });

  it('should validate theme name', () => {
    const validTheme: CustomTheme = {
      type: 'custom',
      name: 'Valid Theme Name',
      Background: '#1a1a1a',
      Foreground: '#ffffff',
      LightBlue: '#89b4fa',
      AccentBlue: '#3b82f6',
      AccentPurple: '#8b5cf6',
      AccentCyan: '#06b6d4',
      AccentGreen: '#10b981',
      AccentYellow: '#f59e0b',
      AccentRed: '#ef4444',
      Comment: '#6b7280',
      Gray: '#9ca3af',
    };

    const validation = validateCustomTheme(validTheme);
    expect(validation.isValid).toBe(true);
  });

  it('should reject empty theme name', () => {
    const invalidTheme: CustomTheme = {
      type: 'custom',
      name: '',
      Background: '#1a1a1a',
      Foreground: '#ffffff',
      LightBlue: '#89b4fa',
      AccentBlue: '#3b82f6',
      AccentPurple: '#8b5cf6',
      AccentCyan: '#06b6d4',
      AccentGreen: '#10b981',
      AccentYellow: '#f59e0b',
      AccentRed: '#ef4444',
      Comment: '#6b7280',
      Gray: '#9ca3af',
    };

    const validation = validateCustomTheme(invalidTheme);
    expect(validation.isValid).toBe(false);
    expect(validation.error).toContain('Missing required field: name');
  });
}); 