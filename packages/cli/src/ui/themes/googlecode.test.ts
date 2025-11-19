/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { GoogleCode } from './googlecode.js';

describe('GoogleCode theme', () => {
  describe('basic properties', () => {
    it('should have name "Google Code"', () => {
      expect(GoogleCode.name).toBe('Google Code');
    });

    it('should have type "light"', () => {
      expect(GoogleCode.type).toBe('light');
    });

    it('should be a Theme instance', () => {
      expect(GoogleCode).toBeDefined();
      expect(typeof GoogleCode.getInkColor).toBe('function');
    });
  });

  describe('colors property', () => {
    it('should have colors object', () => {
      expect(GoogleCode.colors).toBeDefined();
      expect(typeof GoogleCode.colors).toBe('object');
    });

    it('should have type "light"', () => {
      expect(GoogleCode.colors.type).toBe('light');
    });

    it('should have Background color', () => {
      expect(GoogleCode.colors.Background).toBe('white');
    });

    it('should have Foreground color', () => {
      expect(GoogleCode.colors.Foreground).toBe('#444');
    });

    it('should have LightBlue color', () => {
      expect(GoogleCode.colors.LightBlue).toBe('#066');
    });

    it('should have AccentBlue color', () => {
      expect(GoogleCode.colors.AccentBlue).toBe('#008');
    });

    it('should have AccentPurple color', () => {
      expect(GoogleCode.colors.AccentPurple).toBe('#606');
    });

    it('should have AccentCyan color', () => {
      expect(GoogleCode.colors.AccentCyan).toBe('#066');
    });

    it('should have AccentGreen color', () => {
      expect(GoogleCode.colors.AccentGreen).toBe('#080');
    });

    it('should have AccentYellow color', () => {
      expect(GoogleCode.colors.AccentYellow).toBe('#660');
    });

    it('should have AccentRed color', () => {
      expect(GoogleCode.colors.AccentRed).toBe('#800');
    });

    it('should have DiffAdded color', () => {
      expect(GoogleCode.colors.DiffAdded).toBe('#C6EAD8');
    });

    it('should have DiffRemoved color', () => {
      expect(GoogleCode.colors.DiffRemoved).toBe('#FEDEDE');
    });

    it('should have Comment color', () => {
      expect(GoogleCode.colors.Comment).toBe('#5f6368');
    });

    it('should have Gray color', () => {
      expect(GoogleCode.colors.Gray).toBeDefined();
    });

    it('should have GradientColors array', () => {
      expect(GoogleCode.colors.GradientColors).toEqual(['#066', '#606']);
    });

    it('should have two gradient colors', () => {
      expect(GoogleCode.colors.GradientColors).toHaveLength(2);
    });

    it('should use 3-digit hex color format for some colors', () => {
      expect(GoogleCode.colors.AccentBlue).toMatch(/^#[0-9a-fA-F]{3}$/);
    });
  });

  describe('getInkColor method', () => {
    it('should provide color for hljs-comment', () => {
      const color = GoogleCode.getInkColor('hljs-comment');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-quote', () => {
      const color = GoogleCode.getInkColor('hljs-quote');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-keyword', () => {
      const color = GoogleCode.getInkColor('hljs-keyword');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-tag', () => {
      const color = GoogleCode.getInkColor('hljs-selector-tag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-section', () => {
      const color = GoogleCode.getInkColor('hljs-section');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-title', () => {
      const color = GoogleCode.getInkColor('hljs-title');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-name', () => {
      const color = GoogleCode.getInkColor('hljs-name');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-variable', () => {
      const color = GoogleCode.getInkColor('hljs-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-template-variable', () => {
      const color = GoogleCode.getInkColor('hljs-template-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-string', () => {
      const color = GoogleCode.getInkColor('hljs-string');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-attr', () => {
      const color = GoogleCode.getInkColor('hljs-selector-attr');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-pseudo', () => {
      const color = GoogleCode.getInkColor('hljs-selector-pseudo');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-regexp', () => {
      const color = GoogleCode.getInkColor('hljs-regexp');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-literal', () => {
      const color = GoogleCode.getInkColor('hljs-literal');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-symbol', () => {
      const color = GoogleCode.getInkColor('hljs-symbol');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-bullet', () => {
      const color = GoogleCode.getInkColor('hljs-bullet');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-meta', () => {
      const color = GoogleCode.getInkColor('hljs-meta');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-number', () => {
      const color = GoogleCode.getInkColor('hljs-number');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-link', () => {
      const color = GoogleCode.getInkColor('hljs-link');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-doctag', () => {
      const color = GoogleCode.getInkColor('hljs-doctag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-type', () => {
      const color = GoogleCode.getInkColor('hljs-type');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-attr', () => {
      const color = GoogleCode.getInkColor('hljs-attr');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-built_in', () => {
      const color = GoogleCode.getInkColor('hljs-built_in');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-builtin-name', () => {
      const color = GoogleCode.getInkColor('hljs-builtin-name');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-params', () => {
      const color = GoogleCode.getInkColor('hljs-params');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-attribute', () => {
      const color = GoogleCode.getInkColor('hljs-attribute');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-subst', () => {
      const color = GoogleCode.getInkColor('hljs-subst');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-id', () => {
      const color = GoogleCode.getInkColor('hljs-selector-id');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-class', () => {
      const color = GoogleCode.getInkColor('hljs-selector-class');
      expect(color).toBeDefined();
    });

    it('should return undefined for unknown class', () => {
      const color = GoogleCode.getInkColor('unknown-class');
      expect(color).toBeUndefined();
    });
  });

  describe('semanticColors property', () => {
    it('should have semanticColors object', () => {
      expect(GoogleCode.semanticColors).toBeDefined();
      expect(typeof GoogleCode.semanticColors).toBe('object');
    });

    it('should have text colors', () => {
      expect(GoogleCode.semanticColors.text).toBeDefined();
      expect(GoogleCode.semanticColors.text.primary).toBeDefined();
      expect(GoogleCode.semanticColors.text.secondary).toBeDefined();
    });

    it('should have background colors', () => {
      expect(GoogleCode.semanticColors.background).toBeDefined();
      expect(GoogleCode.semanticColors.background.primary).toBeDefined();
    });

    it('should have border colors', () => {
      expect(GoogleCode.semanticColors.border).toBeDefined();
      expect(GoogleCode.semanticColors.border.default).toBeDefined();
    });

    it('should have ui colors', () => {
      expect(GoogleCode.semanticColors.ui).toBeDefined();
    });

    it('should have status colors', () => {
      expect(GoogleCode.semanticColors.status).toBeDefined();
      expect(GoogleCode.semanticColors.status.error).toBeDefined();
      expect(GoogleCode.semanticColors.status.success).toBeDefined();
    });
  });
});
