/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { DefaultDark } from './default.js';

describe('DefaultDark theme', () => {
  describe('basic properties', () => {
    it('should have name "Default"', () => {
      expect(DefaultDark.name).toBe('Default');
    });

    it('should have type "dark"', () => {
      expect(DefaultDark.type).toBe('dark');
    });

    it('should be a Theme instance', () => {
      expect(DefaultDark).toBeDefined();
      expect(typeof DefaultDark.getInkColor).toBe('function');
    });
  });

  describe('colors property', () => {
    it('should have colors object', () => {
      expect(DefaultDark.colors).toBeDefined();
      expect(typeof DefaultDark.colors).toBe('object');
    });

    it('should have type "dark"', () => {
      expect(DefaultDark.colors.type).toBe('dark');
    });

    it('should have Background color', () => {
      expect(DefaultDark.colors.Background).toBeDefined();
      expect(typeof DefaultDark.colors.Background).toBe('string');
    });

    it('should have Foreground color', () => {
      expect(DefaultDark.colors.Foreground).toBeDefined();
      expect(typeof DefaultDark.colors.Foreground).toBe('string');
    });

    it('should have LightBlue color', () => {
      expect(DefaultDark.colors.LightBlue).toBeDefined();
    });

    it('should have AccentBlue color', () => {
      expect(DefaultDark.colors.AccentBlue).toBeDefined();
    });

    it('should have AccentPurple color', () => {
      expect(DefaultDark.colors.AccentPurple).toBeDefined();
    });

    it('should have AccentCyan color', () => {
      expect(DefaultDark.colors.AccentCyan).toBeDefined();
    });

    it('should have AccentGreen color', () => {
      expect(DefaultDark.colors.AccentGreen).toBeDefined();
    });

    it('should have AccentYellow color', () => {
      expect(DefaultDark.colors.AccentYellow).toBeDefined();
    });

    it('should have AccentRed color', () => {
      expect(DefaultDark.colors.AccentRed).toBeDefined();
    });

    it('should have Comment color', () => {
      expect(DefaultDark.colors.Comment).toBeDefined();
    });

    it('should have Gray color', () => {
      expect(DefaultDark.colors.Gray).toBeDefined();
    });
  });

  describe('getInkColor method', () => {
    it('should provide color for hljs-keyword', () => {
      const color = DefaultDark.getInkColor('hljs-keyword');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-literal', () => {
      const color = DefaultDark.getInkColor('hljs-literal');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-symbol', () => {
      const color = DefaultDark.getInkColor('hljs-symbol');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-name', () => {
      const color = DefaultDark.getInkColor('hljs-name');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-link', () => {
      const color = DefaultDark.getInkColor('hljs-link');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-built_in', () => {
      const color = DefaultDark.getInkColor('hljs-built_in');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-type', () => {
      const color = DefaultDark.getInkColor('hljs-type');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-number', () => {
      const color = DefaultDark.getInkColor('hljs-number');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-class', () => {
      const color = DefaultDark.getInkColor('hljs-class');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-string', () => {
      const color = DefaultDark.getInkColor('hljs-string');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-meta-string', () => {
      const color = DefaultDark.getInkColor('hljs-meta-string');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-regexp', () => {
      const color = DefaultDark.getInkColor('hljs-regexp');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-template-tag', () => {
      const color = DefaultDark.getInkColor('hljs-template-tag');
      expect(color).toBeDefined();
    });

    it('should return undefined for hljs-subst (uses foreground)', () => {
      const color = DefaultDark.getInkColor('hljs-subst');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-function (uses foreground)', () => {
      const color = DefaultDark.getInkColor('hljs-function');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-title (uses foreground)', () => {
      const color = DefaultDark.getInkColor('hljs-title');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-params (uses foreground)', () => {
      const color = DefaultDark.getInkColor('hljs-params');
      expect(color).toBeUndefined();
    });

    it('should return undefined for hljs-formula (uses foreground)', () => {
      const color = DefaultDark.getInkColor('hljs-formula');
      expect(color).toBeUndefined();
    });

    it('should provide color for hljs-comment', () => {
      const color = DefaultDark.getInkColor('hljs-comment');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-quote', () => {
      const color = DefaultDark.getInkColor('hljs-quote');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-doctag', () => {
      const color = DefaultDark.getInkColor('hljs-doctag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-meta', () => {
      const color = DefaultDark.getInkColor('hljs-meta');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-meta-keyword', () => {
      const color = DefaultDark.getInkColor('hljs-meta-keyword');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-tag', () => {
      const color = DefaultDark.getInkColor('hljs-tag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-variable', () => {
      const color = DefaultDark.getInkColor('hljs-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-template-variable', () => {
      const color = DefaultDark.getInkColor('hljs-template-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-attr', () => {
      const color = DefaultDark.getInkColor('hljs-attr');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-attribute', () => {
      const color = DefaultDark.getInkColor('hljs-attribute');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-builtin-name', () => {
      const color = DefaultDark.getInkColor('hljs-builtin-name');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-section', () => {
      const color = DefaultDark.getInkColor('hljs-section');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-bullet', () => {
      const color = DefaultDark.getInkColor('hljs-bullet');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-tag', () => {
      const color = DefaultDark.getInkColor('hljs-selector-tag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-id', () => {
      const color = DefaultDark.getInkColor('hljs-selector-id');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-class', () => {
      const color = DefaultDark.getInkColor('hljs-selector-class');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-attr', () => {
      const color = DefaultDark.getInkColor('hljs-selector-attr');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-pseudo', () => {
      const color = DefaultDark.getInkColor('hljs-selector-pseudo');
      expect(color).toBeDefined();
    });

    it('should return undefined for unknown class', () => {
      const color = DefaultDark.getInkColor('unknown-class');
      expect(color).toBeUndefined();
    });
  });

  describe('semanticColors property', () => {
    it('should have semanticColors object', () => {
      expect(DefaultDark.semanticColors).toBeDefined();
      expect(typeof DefaultDark.semanticColors).toBe('object');
    });

    it('should have text colors', () => {
      expect(DefaultDark.semanticColors.text).toBeDefined();
      expect(DefaultDark.semanticColors.text.primary).toBeDefined();
      expect(DefaultDark.semanticColors.text.secondary).toBeDefined();
    });

    it('should have background colors', () => {
      expect(DefaultDark.semanticColors.background).toBeDefined();
      expect(DefaultDark.semanticColors.background.primary).toBeDefined();
    });

    it('should have border colors', () => {
      expect(DefaultDark.semanticColors.border).toBeDefined();
      expect(DefaultDark.semanticColors.border.default).toBeDefined();
    });

    it('should have ui colors', () => {
      expect(DefaultDark.semanticColors.ui).toBeDefined();
    });

    it('should have status colors', () => {
      expect(DefaultDark.semanticColors.status).toBeDefined();
      expect(DefaultDark.semanticColors.status.error).toBeDefined();
      expect(DefaultDark.semanticColors.status.success).toBeDefined();
    });
  });
});
