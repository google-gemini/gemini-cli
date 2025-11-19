/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { AtomOneDark } from './atom-one-dark.js';

describe('AtomOneDark theme', () => {
  describe('basic properties', () => {
    it('should have name "Atom One"', () => {
      expect(AtomOneDark.name).toBe('Atom One');
    });

    it('should have type "dark"', () => {
      expect(AtomOneDark.type).toBe('dark');
    });

    it('should be a Theme instance', () => {
      expect(AtomOneDark).toBeDefined();
      expect(typeof AtomOneDark.getInkColor).toBe('function');
    });
  });

  describe('colors property', () => {
    it('should have colors object', () => {
      expect(AtomOneDark.colors).toBeDefined();
      expect(typeof AtomOneDark.colors).toBe('object');
    });

    it('should have type "dark"', () => {
      expect(AtomOneDark.colors.type).toBe('dark');
    });

    it('should have Background color', () => {
      expect(AtomOneDark.colors.Background).toBe('#282c34');
    });

    it('should have Foreground color', () => {
      expect(AtomOneDark.colors.Foreground).toBe('#abb2bf');
    });

    it('should have LightBlue color', () => {
      expect(AtomOneDark.colors.LightBlue).toBe('#61aeee');
    });

    it('should have AccentBlue color', () => {
      expect(AtomOneDark.colors.AccentBlue).toBe('#61aeee');
    });

    it('should have AccentPurple color', () => {
      expect(AtomOneDark.colors.AccentPurple).toBe('#c678dd');
    });

    it('should have AccentCyan color', () => {
      expect(AtomOneDark.colors.AccentCyan).toBe('#56b6c2');
    });

    it('should have AccentGreen color', () => {
      expect(AtomOneDark.colors.AccentGreen).toBe('#98c379');
    });

    it('should have AccentYellow color', () => {
      expect(AtomOneDark.colors.AccentYellow).toBe('#e6c07b');
    });

    it('should have AccentRed color', () => {
      expect(AtomOneDark.colors.AccentRed).toBe('#e06c75');
    });

    it('should have DiffAdded color', () => {
      expect(AtomOneDark.colors.DiffAdded).toBe('#39544E');
    });

    it('should have DiffRemoved color', () => {
      expect(AtomOneDark.colors.DiffRemoved).toBe('#562B2F');
    });

    it('should have Comment color', () => {
      expect(AtomOneDark.colors.Comment).toBe('#5c6370');
    });

    it('should have Gray color', () => {
      expect(AtomOneDark.colors.Gray).toBe('#5c6370');
    });

    it('should have GradientColors array', () => {
      expect(AtomOneDark.colors.GradientColors).toEqual(['#61aeee', '#98c379']);
    });

    it('should have two gradient colors', () => {
      expect(AtomOneDark.colors.GradientColors).toHaveLength(2);
    });

    it('should have dark background', () => {
      expect(AtomOneDark.colors.Background.startsWith('#')).toBe(true);
    });
  });

  describe('getInkColor method', () => {
    it('should provide color for hljs-comment', () => {
      const color = AtomOneDark.getInkColor('hljs-comment');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-quote', () => {
      const color = AtomOneDark.getInkColor('hljs-quote');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-doctag', () => {
      const color = AtomOneDark.getInkColor('hljs-doctag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-keyword', () => {
      const color = AtomOneDark.getInkColor('hljs-keyword');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-formula', () => {
      const color = AtomOneDark.getInkColor('hljs-formula');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-section', () => {
      const color = AtomOneDark.getInkColor('hljs-section');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-name', () => {
      const color = AtomOneDark.getInkColor('hljs-name');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-tag', () => {
      const color = AtomOneDark.getInkColor('hljs-selector-tag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-deletion', () => {
      const color = AtomOneDark.getInkColor('hljs-deletion');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-subst', () => {
      const color = AtomOneDark.getInkColor('hljs-subst');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-literal', () => {
      const color = AtomOneDark.getInkColor('hljs-literal');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-string', () => {
      const color = AtomOneDark.getInkColor('hljs-string');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-regexp', () => {
      const color = AtomOneDark.getInkColor('hljs-regexp');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-addition', () => {
      const color = AtomOneDark.getInkColor('hljs-addition');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-attribute', () => {
      const color = AtomOneDark.getInkColor('hljs-attribute');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-meta-string', () => {
      const color = AtomOneDark.getInkColor('hljs-meta-string');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-built_in', () => {
      const color = AtomOneDark.getInkColor('hljs-built_in');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-attr', () => {
      const color = AtomOneDark.getInkColor('hljs-attr');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-variable', () => {
      const color = AtomOneDark.getInkColor('hljs-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-template-variable', () => {
      const color = AtomOneDark.getInkColor('hljs-template-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-type', () => {
      const color = AtomOneDark.getInkColor('hljs-type');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-class', () => {
      const color = AtomOneDark.getInkColor('hljs-selector-class');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-attr', () => {
      const color = AtomOneDark.getInkColor('hljs-selector-attr');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-pseudo', () => {
      const color = AtomOneDark.getInkColor('hljs-selector-pseudo');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-number', () => {
      const color = AtomOneDark.getInkColor('hljs-number');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-symbol', () => {
      const color = AtomOneDark.getInkColor('hljs-symbol');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-bullet', () => {
      const color = AtomOneDark.getInkColor('hljs-bullet');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-link', () => {
      const color = AtomOneDark.getInkColor('hljs-link');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-meta', () => {
      const color = AtomOneDark.getInkColor('hljs-meta');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-id', () => {
      const color = AtomOneDark.getInkColor('hljs-selector-id');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-title', () => {
      const color = AtomOneDark.getInkColor('hljs-title');
      expect(color).toBeDefined();
    });

    it('should return undefined for unknown class', () => {
      const color = AtomOneDark.getInkColor('unknown-class');
      expect(color).toBeUndefined();
    });
  });

  describe('semanticColors property', () => {
    it('should have semanticColors object', () => {
      expect(AtomOneDark.semanticColors).toBeDefined();
      expect(typeof AtomOneDark.semanticColors).toBe('object');
    });

    it('should have text colors', () => {
      expect(AtomOneDark.semanticColors.text).toBeDefined();
      expect(AtomOneDark.semanticColors.text.primary).toBeDefined();
      expect(AtomOneDark.semanticColors.text.secondary).toBeDefined();
    });

    it('should have background colors', () => {
      expect(AtomOneDark.semanticColors.background).toBeDefined();
      expect(AtomOneDark.semanticColors.background.primary).toBeDefined();
    });

    it('should have border colors', () => {
      expect(AtomOneDark.semanticColors.border).toBeDefined();
      expect(AtomOneDark.semanticColors.border.default).toBeDefined();
    });

    it('should have ui colors', () => {
      expect(AtomOneDark.semanticColors.ui).toBeDefined();
    });

    it('should have status colors', () => {
      expect(AtomOneDark.semanticColors.status).toBeDefined();
      expect(AtomOneDark.semanticColors.status.error).toBeDefined();
      expect(AtomOneDark.semanticColors.status.success).toBeDefined();
    });
  });
});
