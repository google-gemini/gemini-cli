/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { AyuLight } from './ayu-light.js';

describe('AyuLight theme', () => {
  describe('basic properties', () => {
    it('should have name "Ayu Light"', () => {
      expect(AyuLight.name).toBe('Ayu Light');
    });

    it('should have type "light"', () => {
      expect(AyuLight.type).toBe('light');
    });

    it('should be a Theme instance', () => {
      expect(AyuLight).toBeDefined();
      expect(typeof AyuLight.getInkColor).toBe('function');
    });
  });

  describe('colors property', () => {
    it('should have colors object', () => {
      expect(AyuLight.colors).toBeDefined();
      expect(typeof AyuLight.colors).toBe('object');
    });

    it('should have type property', () => {
      expect(AyuLight.colors.type).toBe('light');
    });

    it('should have Background color', () => {
      expect(AyuLight.colors.Background).toBe('#f8f9fa');
    });

    it('should have Foreground color', () => {
      expect(AyuLight.colors.Foreground).toBe('#5c6166');
    });

    it('should have LightBlue color', () => {
      expect(AyuLight.colors.LightBlue).toBe('#55b4d4');
    });

    it('should have AccentBlue color', () => {
      expect(AyuLight.colors.AccentBlue).toBe('#399ee6');
    });

    it('should have AccentPurple color', () => {
      expect(AyuLight.colors.AccentPurple).toBe('#a37acc');
    });

    it('should have AccentCyan color', () => {
      expect(AyuLight.colors.AccentCyan).toBe('#4cbf99');
    });

    it('should have AccentGreen color', () => {
      expect(AyuLight.colors.AccentGreen).toBe('#86b300');
    });

    it('should have AccentYellow color', () => {
      expect(AyuLight.colors.AccentYellow).toBe('#f2ae49');
    });

    it('should have AccentRed color', () => {
      expect(AyuLight.colors.AccentRed).toBe('#f07171');
    });

    it('should have DiffAdded color', () => {
      expect(AyuLight.colors.DiffAdded).toBe('#C6EAD8');
    });

    it('should have DiffRemoved color', () => {
      expect(AyuLight.colors.DiffRemoved).toBe('#FFCCCC');
    });

    it('should have Comment color', () => {
      expect(AyuLight.colors.Comment).toBe('#ABADB1');
    });

    it('should have Gray color', () => {
      expect(AyuLight.colors.Gray).toBe('#a6aaaf');
    });

    it('should have GradientColors array', () => {
      expect(AyuLight.colors.GradientColors).toEqual(['#399ee6', '#86b300']);
    });

    it('should have two gradient colors', () => {
      expect(AyuLight.colors.GradientColors).toHaveLength(2);
    });
  });

  describe('getInkColor method', () => {
    it('should provide color for hljs-comment', () => {
      const color = AyuLight.getInkColor('hljs-comment');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-quote', () => {
      const color = AyuLight.getInkColor('hljs-quote');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-string', () => {
      const color = AyuLight.getInkColor('hljs-string');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-constant', () => {
      const color = AyuLight.getInkColor('hljs-constant');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-number', () => {
      const color = AyuLight.getInkColor('hljs-number');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-keyword', () => {
      const color = AyuLight.getInkColor('hljs-keyword');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-tag', () => {
      const color = AyuLight.getInkColor('hljs-selector-tag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-attribute', () => {
      const color = AyuLight.getInkColor('hljs-attribute');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-variable', () => {
      const color = AyuLight.getInkColor('hljs-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-variable.language', () => {
      const color = AyuLight.getInkColor('hljs-variable.language');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-title', () => {
      const color = AyuLight.getInkColor('hljs-title');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-section', () => {
      const color = AyuLight.getInkColor('hljs-section');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-type', () => {
      const color = AyuLight.getInkColor('hljs-type');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-tag', () => {
      const color = AyuLight.getInkColor('hljs-tag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-name', () => {
      const color = AyuLight.getInkColor('hljs-name');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-builtin-name', () => {
      const color = AyuLight.getInkColor('hljs-builtin-name');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-meta', () => {
      const color = AyuLight.getInkColor('hljs-meta');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-symbol', () => {
      const color = AyuLight.getInkColor('hljs-symbol');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-bullet', () => {
      const color = AyuLight.getInkColor('hljs-bullet');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-regexp', () => {
      const color = AyuLight.getInkColor('hljs-regexp');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-link', () => {
      const color = AyuLight.getInkColor('hljs-link');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-deletion', () => {
      const color = AyuLight.getInkColor('hljs-deletion');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-addition', () => {
      const color = AyuLight.getInkColor('hljs-addition');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-literal', () => {
      const color = AyuLight.getInkColor('hljs-literal');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-built_in', () => {
      const color = AyuLight.getInkColor('hljs-built_in');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-doctag', () => {
      const color = AyuLight.getInkColor('hljs-doctag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-template-variable', () => {
      const color = AyuLight.getInkColor('hljs-template-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-id', () => {
      const color = AyuLight.getInkColor('hljs-selector-id');
      expect(color).toBeDefined();
    });

    it('should return undefined for unknown class', () => {
      const color = AyuLight.getInkColor('unknown-class');
      expect(color).toBeUndefined();
    });
  });

  describe('semanticColors property', () => {
    it('should have semanticColors object', () => {
      expect(AyuLight.semanticColors).toBeDefined();
      expect(typeof AyuLight.semanticColors).toBe('object');
    });

    it('should have text colors', () => {
      expect(AyuLight.semanticColors.text).toBeDefined();
      expect(AyuLight.semanticColors.text.primary).toBeDefined();
      expect(AyuLight.semanticColors.text.secondary).toBeDefined();
    });

    it('should have background colors', () => {
      expect(AyuLight.semanticColors.background).toBeDefined();
      expect(AyuLight.semanticColors.background.primary).toBeDefined();
    });

    it('should have border colors', () => {
      expect(AyuLight.semanticColors.border).toBeDefined();
      expect(AyuLight.semanticColors.border.default).toBeDefined();
    });

    it('should have ui colors', () => {
      expect(AyuLight.semanticColors.ui).toBeDefined();
    });

    it('should have status colors', () => {
      expect(AyuLight.semanticColors.status).toBeDefined();
      expect(AyuLight.semanticColors.status.error).toBeDefined();
      expect(AyuLight.semanticColors.status.success).toBeDefined();
    });
  });
});
