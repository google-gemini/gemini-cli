/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { ANSILight } from './ansi-light.js';

describe('ANSILight theme', () => {
  describe('basic properties', () => {
    it('should have name "ANSI Light"', () => {
      expect(ANSILight.name).toBe('ANSI Light');
    });

    it('should have type "light"', () => {
      expect(ANSILight.type).toBe('light');
    });

    it('should be a Theme instance', () => {
      expect(ANSILight).toBeDefined();
      expect(typeof ANSILight.getInkColor).toBe('function');
    });
  });

  describe('colors property', () => {
    it('should have colors object', () => {
      expect(ANSILight.colors).toBeDefined();
      expect(typeof ANSILight.colors).toBe('object');
    });

    it('should have type "light"', () => {
      expect(ANSILight.colors.type).toBe('light');
    });

    it('should have Background color', () => {
      expect(ANSILight.colors.Background).toBe('white');
    });

    it('should have Foreground color', () => {
      expect(ANSILight.colors.Foreground).toBe('#444');
    });

    it('should have LightBlue color', () => {
      expect(ANSILight.colors.LightBlue).toBe('blue');
    });

    it('should have AccentBlue color', () => {
      expect(ANSILight.colors.AccentBlue).toBe('blue');
    });

    it('should have AccentPurple color', () => {
      expect(ANSILight.colors.AccentPurple).toBe('purple');
    });

    it('should have AccentCyan color', () => {
      expect(ANSILight.colors.AccentCyan).toBe('cyan');
    });

    it('should have AccentGreen color', () => {
      expect(ANSILight.colors.AccentGreen).toBe('green');
    });

    it('should have AccentYellow color', () => {
      expect(ANSILight.colors.AccentYellow).toBe('orange');
    });

    it('should have AccentRed color', () => {
      expect(ANSILight.colors.AccentRed).toBe('red');
    });

    it('should have DiffAdded color', () => {
      expect(ANSILight.colors.DiffAdded).toBe('#E5F2E5');
    });

    it('should have DiffRemoved color', () => {
      expect(ANSILight.colors.DiffRemoved).toBe('#FFE5E5');
    });

    it('should have Comment color', () => {
      expect(ANSILight.colors.Comment).toBe('gray');
    });

    it('should have Gray color', () => {
      expect(ANSILight.colors.Gray).toBe('gray');
    });

    it('should have GradientColors array', () => {
      expect(ANSILight.colors.GradientColors).toEqual(['blue', 'green']);
    });

    it('should have two gradient colors', () => {
      expect(ANSILight.colors.GradientColors).toHaveLength(2);
    });

    it('should use basic ANSI color names', () => {
      const ansiColors = ['blue', 'purple', 'cyan', 'green', 'orange', 'red'];
      const usesAnsiColors = ansiColors.some((color) =>
        Object.values(ANSILight.colors).includes(color),
      );
      expect(usesAnsiColors).toBe(true);
    });
  });

  describe('getInkColor method', () => {
    it('should provide color for hljs-keyword', () => {
      const color = ANSILight.getInkColor('hljs-keyword');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-literal', () => {
      const color = ANSILight.getInkColor('hljs-literal');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-symbol', () => {
      const color = ANSILight.getInkColor('hljs-symbol');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-name', () => {
      const color = ANSILight.getInkColor('hljs-name');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-link', () => {
      const color = ANSILight.getInkColor('hljs-link');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-built_in', () => {
      const color = ANSILight.getInkColor('hljs-built_in');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-type', () => {
      const color = ANSILight.getInkColor('hljs-type');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-number', () => {
      const color = ANSILight.getInkColor('hljs-number');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-class', () => {
      const color = ANSILight.getInkColor('hljs-class');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-string', () => {
      const color = ANSILight.getInkColor('hljs-string');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-meta-string', () => {
      const color = ANSILight.getInkColor('hljs-meta-string');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-regexp', () => {
      const color = ANSILight.getInkColor('hljs-regexp');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-template-tag', () => {
      const color = ANSILight.getInkColor('hljs-template-tag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-subst', () => {
      const color = ANSILight.getInkColor('hljs-subst');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-function', () => {
      const color = ANSILight.getInkColor('hljs-function');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-title', () => {
      const color = ANSILight.getInkColor('hljs-title');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-params', () => {
      const color = ANSILight.getInkColor('hljs-params');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-formula', () => {
      const color = ANSILight.getInkColor('hljs-formula');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-comment', () => {
      const color = ANSILight.getInkColor('hljs-comment');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-quote', () => {
      const color = ANSILight.getInkColor('hljs-quote');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-doctag', () => {
      const color = ANSILight.getInkColor('hljs-doctag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-meta', () => {
      const color = ANSILight.getInkColor('hljs-meta');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-meta-keyword', () => {
      const color = ANSILight.getInkColor('hljs-meta-keyword');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-tag', () => {
      const color = ANSILight.getInkColor('hljs-tag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-variable', () => {
      const color = ANSILight.getInkColor('hljs-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-template-variable', () => {
      const color = ANSILight.getInkColor('hljs-template-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-attr', () => {
      const color = ANSILight.getInkColor('hljs-attr');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-attribute', () => {
      const color = ANSILight.getInkColor('hljs-attribute');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-builtin-name', () => {
      const color = ANSILight.getInkColor('hljs-builtin-name');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-section', () => {
      const color = ANSILight.getInkColor('hljs-section');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-bullet', () => {
      const color = ANSILight.getInkColor('hljs-bullet');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-tag', () => {
      const color = ANSILight.getInkColor('hljs-selector-tag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-id', () => {
      const color = ANSILight.getInkColor('hljs-selector-id');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-class', () => {
      const color = ANSILight.getInkColor('hljs-selector-class');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-attr', () => {
      const color = ANSILight.getInkColor('hljs-selector-attr');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-pseudo', () => {
      const color = ANSILight.getInkColor('hljs-selector-pseudo');
      expect(color).toBeDefined();
    });

    it('should return undefined for unknown class', () => {
      const color = ANSILight.getInkColor('unknown-class');
      expect(color).toBeUndefined();
    });
  });

  describe('semanticColors property', () => {
    it('should have semanticColors object', () => {
      expect(ANSILight.semanticColors).toBeDefined();
      expect(typeof ANSILight.semanticColors).toBe('object');
    });

    it('should have text colors', () => {
      expect(ANSILight.semanticColors.text).toBeDefined();
      expect(ANSILight.semanticColors.text.primary).toBeDefined();
      expect(ANSILight.semanticColors.text.secondary).toBeDefined();
    });

    it('should have background colors', () => {
      expect(ANSILight.semanticColors.background).toBeDefined();
      expect(ANSILight.semanticColors.background.primary).toBeDefined();
    });

    it('should have border colors', () => {
      expect(ANSILight.semanticColors.border).toBeDefined();
      expect(ANSILight.semanticColors.border.default).toBeDefined();
    });

    it('should have ui colors', () => {
      expect(ANSILight.semanticColors.ui).toBeDefined();
    });

    it('should have status colors', () => {
      expect(ANSILight.semanticColors.status).toBeDefined();
      expect(ANSILight.semanticColors.status.error).toBeDefined();
      expect(ANSILight.semanticColors.status.success).toBeDefined();
    });
  });
});
