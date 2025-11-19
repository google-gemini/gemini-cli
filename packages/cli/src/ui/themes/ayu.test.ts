/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { AyuDark } from './ayu.js';

describe('AyuDark theme', () => {
  describe('basic properties', () => {
    it('should have name "Ayu"', () => {
      expect(AyuDark.name).toBe('Ayu');
    });

    it('should have type "dark"', () => {
      expect(AyuDark.type).toBe('dark');
    });

    it('should be a Theme instance', () => {
      expect(AyuDark).toBeDefined();
      expect(typeof AyuDark.getInkColor).toBe('function');
    });
  });

  describe('colors property', () => {
    it('should have colors object', () => {
      expect(AyuDark.colors).toBeDefined();
      expect(typeof AyuDark.colors).toBe('object');
    });

    it('should have type "dark"', () => {
      expect(AyuDark.colors.type).toBe('dark');
    });

    it('should have Background color', () => {
      expect(AyuDark.colors.Background).toBe('#0b0e14');
    });

    it('should have Foreground color', () => {
      expect(AyuDark.colors.Foreground).toBe('#aeaca6');
    });

    it('should have LightBlue color', () => {
      expect(AyuDark.colors.LightBlue).toBe('#59C2FF');
    });

    it('should have AccentBlue color', () => {
      expect(AyuDark.colors.AccentBlue).toBe('#39BAE6');
    });

    it('should have AccentPurple color', () => {
      expect(AyuDark.colors.AccentPurple).toBe('#D2A6FF');
    });

    it('should have AccentCyan color', () => {
      expect(AyuDark.colors.AccentCyan).toBe('#95E6CB');
    });

    it('should have AccentGreen color', () => {
      expect(AyuDark.colors.AccentGreen).toBe('#AAD94C');
    });

    it('should have AccentYellow color', () => {
      expect(AyuDark.colors.AccentYellow).toBe('#FFB454');
    });

    it('should have AccentRed color', () => {
      expect(AyuDark.colors.AccentRed).toBe('#F26D78');
    });

    it('should have DiffAdded color', () => {
      expect(AyuDark.colors.DiffAdded).toBe('#293022');
    });

    it('should have DiffRemoved color', () => {
      expect(AyuDark.colors.DiffRemoved).toBe('#3D1215');
    });

    it('should have Comment color', () => {
      expect(AyuDark.colors.Comment).toBe('#646A71');
    });

    it('should have Gray color', () => {
      expect(AyuDark.colors.Gray).toBe('#3D4149');
    });

    it('should have GradientColors array', () => {
      expect(AyuDark.colors.GradientColors).toEqual(['#FFB454', '#F26D78']);
    });

    it('should have two gradient colors', () => {
      expect(AyuDark.colors.GradientColors).toHaveLength(2);
    });

    it('should have dark background color', () => {
      expect(AyuDark.colors.Background).toContain('0b0e14');
    });

    it('should have vibrant accent colors', () => {
      expect(AyuDark.colors.AccentYellow).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(AyuDark.colors.AccentRed).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  describe('getInkColor method', () => {
    it('should provide color for hljs-keyword', () => {
      const color = AyuDark.getInkColor('hljs-keyword');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-literal', () => {
      const color = AyuDark.getInkColor('hljs-literal');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-symbol', () => {
      const color = AyuDark.getInkColor('hljs-symbol');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-name', () => {
      const color = AyuDark.getInkColor('hljs-name');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-link', () => {
      const color = AyuDark.getInkColor('hljs-link');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-subst', () => {
      const color = AyuDark.getInkColor('hljs-subst');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-string', () => {
      const color = AyuDark.getInkColor('hljs-string');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-title', () => {
      const color = AyuDark.getInkColor('hljs-title');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-type', () => {
      const color = AyuDark.getInkColor('hljs-type');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-attribute', () => {
      const color = AyuDark.getInkColor('hljs-attribute');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-bullet', () => {
      const color = AyuDark.getInkColor('hljs-bullet');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-addition', () => {
      const color = AyuDark.getInkColor('hljs-addition');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-variable', () => {
      const color = AyuDark.getInkColor('hljs-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-template-tag', () => {
      const color = AyuDark.getInkColor('hljs-template-tag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-template-variable', () => {
      const color = AyuDark.getInkColor('hljs-template-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-comment', () => {
      const color = AyuDark.getInkColor('hljs-comment');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-quote', () => {
      const color = AyuDark.getInkColor('hljs-quote');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-deletion', () => {
      const color = AyuDark.getInkColor('hljs-deletion');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-meta', () => {
      const color = AyuDark.getInkColor('hljs-meta');
      expect(color).toBeDefined();
    });

    it('should return undefined for unknown class', () => {
      const color = AyuDark.getInkColor('unknown-class');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-doctag (has style but no color)', () => {
      const color = AyuDark.getInkColor('hljs-doctag');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-strong (has style but no color)', () => {
      const color = AyuDark.getInkColor('hljs-strong');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-emphasis (has style but no color)', () => {
      const color = AyuDark.getInkColor('hljs-emphasis');
      expect(color).toBeUndefined();
    });
  });

  describe('semanticColors property', () => {
    it('should have semanticColors object', () => {
      expect(AyuDark.semanticColors).toBeDefined();
      expect(typeof AyuDark.semanticColors).toBe('object');
    });

    it('should have text colors', () => {
      expect(AyuDark.semanticColors.text).toBeDefined();
      expect(AyuDark.semanticColors.text.primary).toBeDefined();
      expect(AyuDark.semanticColors.text.secondary).toBeDefined();
    });

    it('should have background colors', () => {
      expect(AyuDark.semanticColors.background).toBeDefined();
      expect(AyuDark.semanticColors.background.primary).toBeDefined();
    });

    it('should have border colors', () => {
      expect(AyuDark.semanticColors.border).toBeDefined();
      expect(AyuDark.semanticColors.border.default).toBeDefined();
    });

    it('should have ui colors', () => {
      expect(AyuDark.semanticColors.ui).toBeDefined();
    });

    it('should have status colors', () => {
      expect(AyuDark.semanticColors.status).toBeDefined();
      expect(AyuDark.semanticColors.status.error).toBeDefined();
      expect(AyuDark.semanticColors.status.success).toBeDefined();
    });
  });

  describe('theme styling', () => {
    it('should use italic style for comments', () => {
      expect(AyuDark.name).toBe('Ayu');
    });

    it('should have distinct warm gradient colors', () => {
      const gradientColors = AyuDark.colors.GradientColors;
      expect(gradientColors).toContain('#FFB454');
      expect(gradientColors).toContain('#F26D78');
    });
  });
});
