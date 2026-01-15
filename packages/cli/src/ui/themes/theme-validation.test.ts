/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { validateCustomTheme, type CustomTheme } from './theme.js';

describe('validateCustomTheme', () => {
  it('should validate a correct theme', () => {
    const validTheme: CustomTheme = {
      name: 'Valid Theme',
      type: 'custom',
      background: {
        primary: '#ffffff',
      },
      text: {
        primary: 'black', // Ink color name
      },
      ui: {
        gradient: ['#ff0000', '#0000ff'],
      },
      // unknown properties should be ignored by recursion if they are not colors
      // but strictly speaking our types don't allow unknown props.
      // However, extra props might exist in JSON.
    };

    const result = validateCustomTheme(validTheme);
    expect(result.isValid).toBe(true);
  });

  it('should fail on invalid color name', () => {
    const invalidTheme: CustomTheme = {
      name: 'Invalid Theme',
      type: 'custom',
      text: {
        primary: 'notacolor',
      },
    };

    const result = validateCustomTheme(invalidTheme);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Invalid color "notacolor"');
  });

  it('should fail on invalid hex code', () => {
    const invalidTheme: CustomTheme = {
      name: 'Invalid Hex',
      type: 'custom',
      background: {
        primary: '#12', // Too short
      },
    };

    const result = validateCustomTheme(invalidTheme);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Invalid color "#12"');
  });

  it('should fail on invalid gradient color', () => {
    const invalidTheme: CustomTheme = {
      name: 'Invalid Gradient',
      type: 'custom',
      ui: {
        gradient: ['red', 'blue', 'potato'],
      },
    };

    const result = validateCustomTheme(invalidTheme);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Invalid color "potato"');
  });

  it('should validate deeply nested colors', () => {
    const invalidTheme: CustomTheme = {
      name: 'Deep Invalid',
      type: 'custom',
      background: {
        diff: {
          added: 'invalid-green',
        },
      },
    };

    const result = validateCustomTheme(invalidTheme);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Invalid color "invalid-green"');
  });

  it('should return error for invalid theme name', () => {
    const invalidTheme: CustomTheme = {
      name: '',
      type: 'custom',
    };
    const result = validateCustomTheme(invalidTheme);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Invalid theme name');
  });
});
