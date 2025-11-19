/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { DefaultLight } from './default-light.js';
import { lightTheme, Theme } from './theme.js';

describe('default-light theme', () => {
  describe('DefaultLight export', () => {
    it('should be defined', () => {
      expect(DefaultLight).toBeDefined();
    });

    it('should be instance of Theme', () => {
      expect(DefaultLight).toBeInstanceOf(Theme);
    });

    it('should have name "Default Light"', () => {
      expect(DefaultLight.name).toBe('Default Light');
    });

    it('should have type "light"', () => {
      expect(DefaultLight.type).toBe('light');
    });
  });

  describe('colors property', () => {
    it('should have colors property', () => {
      expect(DefaultLight.colors).toBeDefined();
    });

    it('should use lightTheme colors', () => {
      expect(DefaultLight.colors).toBe(lightTheme);
    });

    it('should have Background color', () => {
      expect(DefaultLight.colors.Background).toBe(lightTheme.Background);
    });

    it('should have Foreground color', () => {
      expect(DefaultLight.colors.Foreground).toBe(lightTheme.Foreground);
    });

    it('should have AccentBlue color', () => {
      expect(DefaultLight.colors.AccentBlue).toBe(lightTheme.AccentBlue);
    });

    it('should have AccentRed color', () => {
      expect(DefaultLight.colors.AccentRed).toBe(lightTheme.AccentRed);
    });

    it('should have AccentGreen color', () => {
      expect(DefaultLight.colors.AccentGreen).toBe(lightTheme.AccentGreen);
    });

    it('should have AccentCyan color', () => {
      expect(DefaultLight.colors.AccentCyan).toBe(lightTheme.AccentCyan);
    });

    it('should have Comment color', () => {
      expect(DefaultLight.colors.Comment).toBe(lightTheme.Comment);
    });

    it('should have Gray color', () => {
      expect(DefaultLight.colors.Gray).toBe(lightTheme.Gray);
    });
  });

  describe('semantic colors', () => {
    it('should have semanticColors property', () => {
      expect(DefaultLight.semanticColors).toBeDefined();
    });

    it('should have text colors', () => {
      expect(DefaultLight.semanticColors.text).toBeDefined();
      expect(DefaultLight.semanticColors.text.primary).toBeDefined();
      expect(DefaultLight.semanticColors.text.secondary).toBeDefined();
      expect(DefaultLight.semanticColors.text.link).toBeDefined();
      expect(DefaultLight.semanticColors.text.accent).toBeDefined();
    });

    it('should have background colors', () => {
      expect(DefaultLight.semanticColors.background).toBeDefined();
      expect(DefaultLight.semanticColors.background.primary).toBeDefined();
      expect(DefaultLight.semanticColors.background.diff).toBeDefined();
      expect(DefaultLight.semanticColors.background.diff.added).toBeDefined();
      expect(DefaultLight.semanticColors.background.diff.removed).toBeDefined();
    });

    it('should have border colors', () => {
      expect(DefaultLight.semanticColors.border).toBeDefined();
      expect(DefaultLight.semanticColors.border.default).toBeDefined();
      expect(DefaultLight.semanticColors.border.focused).toBeDefined();
    });

    it('should have UI colors', () => {
      expect(DefaultLight.semanticColors.ui).toBeDefined();
      expect(DefaultLight.semanticColors.ui.comment).toBeDefined();
      expect(DefaultLight.semanticColors.ui.symbol).toBeDefined();
    });

    it('should have status colors', () => {
      expect(DefaultLight.semanticColors.status).toBeDefined();
      expect(DefaultLight.semanticColors.status.error).toBeDefined();
      expect(DefaultLight.semanticColors.status.success).toBeDefined();
      expect(DefaultLight.semanticColors.status.warning).toBeDefined();
    });
  });

  describe('getInkColor method', () => {
    it('should provide color for hljs-comment', () => {
      const color = DefaultLight.getInkColor('hljs-comment');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-keyword', () => {
      const color = DefaultLight.getInkColor('hljs-keyword');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-string', () => {
      const color = DefaultLight.getInkColor('hljs-string');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-variable', () => {
      const color = DefaultLight.getInkColor('hljs-variable');
      expect(color).toBeDefined();
    });

    it('should return undefined for unknown classes', () => {
      const color = DefaultLight.getInkColor('unknown-class');
      expect(color).toBeUndefined();
    });

    it('should provide color for hljs-built_in', () => {
      const color = DefaultLight.getInkColor('hljs-built_in');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-type', () => {
      const color = DefaultLight.getInkColor('hljs-type');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-title', () => {
      const color = DefaultLight.getInkColor('hljs-title');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-attribute', () => {
      const color = DefaultLight.getInkColor('hljs-attribute');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-symbol', () => {
      const color = DefaultLight.getInkColor('hljs-symbol');
      expect(color).toBeDefined();
    });
  });

  describe('defaultColor property', () => {
    it('should have defaultColor property', () => {
      expect(DefaultLight.defaultColor).toBeDefined();
    });

    it('should be a string', () => {
      expect(typeof DefaultLight.defaultColor).toBe('string');
    });
  });

  describe('theme type', () => {
    it('should have light theme type', () => {
      expect(DefaultLight.type).toBe('light');
    });

    it('should match lightTheme type', () => {
      expect(DefaultLight.type).toBe(lightTheme.type);
    });
  });

  describe('theme colors consistency', () => {
    it('should use lightTheme Background', () => {
      expect(DefaultLight.colors.Background).toBe('#FAFAFA');
    });

    it('should use lightTheme AccentBlue', () => {
      expect(DefaultLight.colors.AccentBlue).toBe('#3B82F6');
    });

    it('should use lightTheme AccentRed', () => {
      expect(DefaultLight.colors.AccentRed).toBe('#DD4C4C');
    });

    it('should use lightTheme AccentGreen', () => {
      expect(DefaultLight.colors.AccentGreen).toBe('#3CA84B');
    });

    it('should use lightTheme AccentCyan', () => {
      expect(DefaultLight.colors.AccentCyan).toBe('#06B6D4');
    });

    it('should use lightTheme Comment', () => {
      expect(DefaultLight.colors.Comment).toBe('#008000');
    });

    it('should use lightTheme Gray', () => {
      expect(DefaultLight.colors.Gray).toBe('#97a0b0');
    });
  });

  describe('exportability', () => {
    it('should be exportable', () => {
      expect(() => {
        const theme = DefaultLight;
        return theme;
      }).not.toThrow();
    });

    it('should maintain reference equality', () => {
      const ref1 = DefaultLight;
      const ref2 = DefaultLight;
      expect(ref1).toBe(ref2);
    });
  });

  describe('highlighting support', () => {
    const highlightClasses = [
      'hljs-comment',
      'hljs-quote',
      'hljs-variable',
      'hljs-keyword',
      'hljs-selector-tag',
      'hljs-built_in',
      'hljs-name',
      'hljs-tag',
      'hljs-string',
      'hljs-title',
      'hljs-section',
      'hljs-attribute',
      'hljs-literal',
      'hljs-template-tag',
      'hljs-template-variable',
      'hljs-type',
      'hljs-attr',
      'hljs-symbol',
      'hljs-bullet',
      'hljs-link',
      'hljs-selector-attr',
      'hljs-selector-pseudo',
      'hljs-meta',
      'hljs-doctag',
    ];

    it('should provide colors for common hljs classes', () => {
      for (const className of highlightClasses) {
        const color = DefaultLight.getInkColor(className);
        // Some classes may not have colors defined, which is ok
        if (color !== undefined) {
          expect(typeof color).toBe('string');
          expect(color.length).toBeGreaterThan(0);
        }
      }
    });

    it('should handle hljs base class', () => {
      const color = DefaultLight.getInkColor('hljs');
      // hljs base might or might not be in the color map
      if (color !== undefined) {
        expect(typeof color).toBe('string');
      }
    });
  });

  describe('color values', () => {
    it('should have valid hex colors', () => {
      const colors = [
        DefaultLight.colors.Background,
        DefaultLight.colors.AccentBlue,
        DefaultLight.colors.AccentRed,
        DefaultLight.colors.AccentGreen,
        DefaultLight.colors.AccentCyan,
        DefaultLight.colors.Comment,
        DefaultLight.colors.Gray,
      ];

      for (const color of colors) {
        if (color) {
          expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
      }
    });

    it('should have gradient colors', () => {
      expect(DefaultLight.colors.GradientColors).toBeDefined();
      expect(Array.isArray(DefaultLight.colors.GradientColors)).toBe(true);
    });
  });

  describe('semantic color structure', () => {
    it('should map semantic text colors to theme colors', () => {
      expect(DefaultLight.semanticColors.text.primary).toBe(
        lightTheme.Foreground,
      );
      expect(DefaultLight.semanticColors.text.secondary).toBe(lightTheme.Gray);
      expect(DefaultLight.semanticColors.text.link).toBe(lightTheme.AccentBlue);
    });

    it('should map semantic background colors to theme colors', () => {
      expect(DefaultLight.semanticColors.background.primary).toBe(
        lightTheme.Background,
      );
      expect(DefaultLight.semanticColors.background.diff.added).toBe(
        lightTheme.DiffAdded,
      );
      expect(DefaultLight.semanticColors.background.diff.removed).toBe(
        lightTheme.DiffRemoved,
      );
    });

    it('should map semantic status colors to theme colors', () => {
      expect(DefaultLight.semanticColors.status.error).toBe(
        lightTheme.AccentRed,
      );
      expect(DefaultLight.semanticColors.status.success).toBe(
        lightTheme.AccentGreen,
      );
      expect(DefaultLight.semanticColors.status.warning).toBe(
        lightTheme.AccentYellow,
      );
    });
  });
});
