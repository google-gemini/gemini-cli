/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { NoColorTheme } from './no-color.js';

describe('NoColorTheme', () => {
  describe('basic properties', () => {
    it('should have name "NoColor"', () => {
      expect(NoColorTheme.name).toBe('NoColor');
    });

    it('should have type "dark"', () => {
      expect(NoColorTheme.type).toBe('dark');
    });

    it('should be a Theme instance', () => {
      expect(NoColorTheme).toBeDefined();
      expect(typeof NoColorTheme.getInkColor).toBe('function');
    });
  });

  describe('colors property', () => {
    it('should have colors object', () => {
      expect(NoColorTheme.colors).toBeDefined();
      expect(typeof NoColorTheme.colors).toBe('object');
    });

    it('should have type "ansi"', () => {
      expect(NoColorTheme.colors.type).toBe('ansi');
    });

    it('should have empty Background color', () => {
      expect(NoColorTheme.colors.Background).toBe('');
    });

    it('should have empty Foreground color', () => {
      expect(NoColorTheme.colors.Foreground).toBe('');
    });

    it('should have empty LightBlue color', () => {
      expect(NoColorTheme.colors.LightBlue).toBe('');
    });

    it('should have empty AccentBlue color', () => {
      expect(NoColorTheme.colors.AccentBlue).toBe('');
    });

    it('should have empty AccentPurple color', () => {
      expect(NoColorTheme.colors.AccentPurple).toBe('');
    });

    it('should have empty AccentCyan color', () => {
      expect(NoColorTheme.colors.AccentCyan).toBe('');
    });

    it('should have empty AccentGreen color', () => {
      expect(NoColorTheme.colors.AccentGreen).toBe('');
    });

    it('should have empty AccentYellow color', () => {
      expect(NoColorTheme.colors.AccentYellow).toBe('');
    });

    it('should have empty AccentRed color', () => {
      expect(NoColorTheme.colors.AccentRed).toBe('');
    });

    it('should have empty DiffAdded color', () => {
      expect(NoColorTheme.colors.DiffAdded).toBe('');
    });

    it('should have empty DiffRemoved color', () => {
      expect(NoColorTheme.colors.DiffRemoved).toBe('');
    });

    it('should have empty Comment color', () => {
      expect(NoColorTheme.colors.Comment).toBe('');
    });

    it('should have empty Gray color', () => {
      expect(NoColorTheme.colors.Gray).toBe('');
    });

    it('should not have GradientColors', () => {
      expect(NoColorTheme.colors.GradientColors).toBeUndefined();
    });

    it('should have all color values as empty strings', () => {
      const colors = NoColorTheme.colors;
      expect(colors.Background).toBe('');
      expect(colors.Foreground).toBe('');
      expect(colors.LightBlue).toBe('');
      expect(colors.AccentBlue).toBe('');
      expect(colors.AccentPurple).toBe('');
      expect(colors.AccentCyan).toBe('');
      expect(colors.AccentGreen).toBe('');
      expect(colors.AccentYellow).toBe('');
      expect(colors.AccentRed).toBe('');
      expect(colors.DiffAdded).toBe('');
      expect(colors.DiffRemoved).toBe('');
      expect(colors.Comment).toBe('');
      expect(colors.Gray).toBe('');
    });
  });

  describe('getInkColor method', () => {
    it('should return undefined for hljs-keyword', () => {
      const color = NoColorTheme.getInkColor('hljs-keyword');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-literal', () => {
      const color = NoColorTheme.getInkColor('hljs-literal');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-symbol', () => {
      const color = NoColorTheme.getInkColor('hljs-symbol');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-name', () => {
      const color = NoColorTheme.getInkColor('hljs-name');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-built_in', () => {
      const color = NoColorTheme.getInkColor('hljs-built_in');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-type', () => {
      const color = NoColorTheme.getInkColor('hljs-type');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-number', () => {
      const color = NoColorTheme.getInkColor('hljs-number');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-class', () => {
      const color = NoColorTheme.getInkColor('hljs-class');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-string', () => {
      const color = NoColorTheme.getInkColor('hljs-string');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-comment', () => {
      const color = NoColorTheme.getInkColor('hljs-comment');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-variable', () => {
      const color = NoColorTheme.getInkColor('hljs-variable');
      expect(color).toBeUndefined();
    });

    it('should return undefined for unknown class', () => {
      const color = NoColorTheme.getInkColor('unknown-class');
      expect(color).toBeUndefined();
    });
  });

  describe('semanticColors property', () => {
    it('should have semanticColors object', () => {
      expect(NoColorTheme.semanticColors).toBeDefined();
      expect(typeof NoColorTheme.semanticColors).toBe('object');
    });

    it('should have text colors', () => {
      expect(NoColorTheme.semanticColors.text).toBeDefined();
      expect(NoColorTheme.semanticColors.text.primary).toBe('');
      expect(NoColorTheme.semanticColors.text.secondary).toBe('');
      expect(NoColorTheme.semanticColors.text.link).toBe('');
      expect(NoColorTheme.semanticColors.text.accent).toBe('');
    });

    it('should have background colors', () => {
      expect(NoColorTheme.semanticColors.background).toBeDefined();
      expect(NoColorTheme.semanticColors.background.primary).toBe('');
    });

    it('should have diff colors', () => {
      expect(NoColorTheme.semanticColors.background.diff).toBeDefined();
      expect(NoColorTheme.semanticColors.background.diff.added).toBe('');
      expect(NoColorTheme.semanticColors.background.diff.removed).toBe('');
    });

    it('should have border colors', () => {
      expect(NoColorTheme.semanticColors.border).toBeDefined();
      expect(NoColorTheme.semanticColors.border.default).toBe('');
      expect(NoColorTheme.semanticColors.border.focused).toBe('');
    });

    it('should have ui colors', () => {
      expect(NoColorTheme.semanticColors.ui).toBeDefined();
      expect(NoColorTheme.semanticColors.ui.comment).toBe('');
      expect(NoColorTheme.semanticColors.ui.symbol).toBe('');
    });

    it('should have empty gradient array', () => {
      expect(NoColorTheme.semanticColors.ui.gradient).toEqual([]);
      expect(NoColorTheme.semanticColors.ui.gradient).toHaveLength(0);
    });

    it('should have status colors', () => {
      expect(NoColorTheme.semanticColors.status).toBeDefined();
      expect(NoColorTheme.semanticColors.status.error).toBe('');
      expect(NoColorTheme.semanticColors.status.success).toBe('');
      expect(NoColorTheme.semanticColors.status.warning).toBe('');
    });

    it('should have all semantic colors as empty strings', () => {
      const semantic = NoColorTheme.semanticColors;
      expect(semantic.text.primary).toBe('');
      expect(semantic.text.secondary).toBe('');
      expect(semantic.background.primary).toBe('');
      expect(semantic.border.default).toBe('');
      expect(semantic.status.error).toBe('');
    });
  });

  describe('NO_COLOR environment variable compliance', () => {
    it('should not define any color values', () => {
      const colors = NoColorTheme.colors;
      const colorValues = Object.entries(colors)
        .filter(([key]) => key !== 'type')
        .map(([, value]) => value)
        .filter((value) => typeof value === 'string');
      const nonEmptyColors = colorValues.filter((value) => value !== '');
      expect(nonEmptyColors).toHaveLength(0);
    });

    it('should have appropriate theme type', () => {
      expect(['light', 'dark', 'ansi']).toContain(NoColorTheme.type);
    });
  });
});
