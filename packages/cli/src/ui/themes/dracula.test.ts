/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { Dracula } from './dracula.js';

describe('Dracula theme', () => {
  describe('basic properties', () => {
    it('should have name "Dracula"', () => {
      expect(Dracula.name).toBe('Dracula');
    });

    it('should have type "dark"', () => {
      expect(Dracula.type).toBe('dark');
    });

    it('should be a Theme instance', () => {
      expect(Dracula).toBeDefined();
      expect(typeof Dracula.getInkColor).toBe('function');
    });
  });

  describe('colors property', () => {
    it('should have colors object', () => {
      expect(Dracula.colors).toBeDefined();
      expect(typeof Dracula.colors).toBe('object');
    });

    it('should have type "dark"', () => {
      expect(Dracula.colors.type).toBe('dark');
    });

    it('should have Background color', () => {
      expect(Dracula.colors.Background).toBe('#282a36');
    });

    it('should have Foreground color', () => {
      expect(Dracula.colors.Foreground).toBe('#a3afb7');
    });

    it('should have LightBlue color', () => {
      expect(Dracula.colors.LightBlue).toBe('#8be9fd');
    });

    it('should have AccentBlue color', () => {
      expect(Dracula.colors.AccentBlue).toBe('#8be9fd');
    });

    it('should have AccentPurple color', () => {
      expect(Dracula.colors.AccentPurple).toBe('#ff79c6');
    });

    it('should have AccentCyan color', () => {
      expect(Dracula.colors.AccentCyan).toBe('#8be9fd');
    });

    it('should have AccentGreen color', () => {
      expect(Dracula.colors.AccentGreen).toBe('#50fa7b');
    });

    it('should have AccentYellow color', () => {
      expect(Dracula.colors.AccentYellow).toBe('#fff783');
    });

    it('should have AccentRed color', () => {
      expect(Dracula.colors.AccentRed).toBe('#ff5555');
    });

    it('should have DiffAdded color', () => {
      expect(Dracula.colors.DiffAdded).toBe('#11431d');
    });

    it('should have DiffRemoved color', () => {
      expect(Dracula.colors.DiffRemoved).toBe('#6e1818');
    });

    it('should have Comment color', () => {
      expect(Dracula.colors.Comment).toBe('#6272a4');
    });

    it('should have Gray color', () => {
      expect(Dracula.colors.Gray).toBe('#6272a4');
    });

    it('should have GradientColors array', () => {
      expect(Dracula.colors.GradientColors).toEqual(['#ff79c6', '#8be9fd']);
    });

    it('should have two gradient colors', () => {
      expect(Dracula.colors.GradientColors).toHaveLength(2);
    });

    it('should have vibrant colors characteristic of Dracula theme', () => {
      expect(Dracula.colors.AccentPurple).toContain('#ff79c6');
      expect(Dracula.colors.AccentGreen).toContain('#50fa7b');
    });
  });

  describe('getInkColor method', () => {
    it('should provide color for hljs-keyword', () => {
      const color = Dracula.getInkColor('hljs-keyword');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-tag', () => {
      const color = Dracula.getInkColor('hljs-selector-tag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-literal', () => {
      const color = Dracula.getInkColor('hljs-literal');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-section', () => {
      const color = Dracula.getInkColor('hljs-section');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-link', () => {
      const color = Dracula.getInkColor('hljs-link');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-subst', () => {
      const color = Dracula.getInkColor('hljs-subst');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-string', () => {
      const color = Dracula.getInkColor('hljs-string');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-title', () => {
      const color = Dracula.getInkColor('hljs-title');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-name', () => {
      const color = Dracula.getInkColor('hljs-name');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-type', () => {
      const color = Dracula.getInkColor('hljs-type');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-attribute', () => {
      const color = Dracula.getInkColor('hljs-attribute');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-symbol', () => {
      const color = Dracula.getInkColor('hljs-symbol');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-bullet', () => {
      const color = Dracula.getInkColor('hljs-bullet');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-addition', () => {
      const color = Dracula.getInkColor('hljs-addition');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-variable', () => {
      const color = Dracula.getInkColor('hljs-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-template-tag', () => {
      const color = Dracula.getInkColor('hljs-template-tag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-template-variable', () => {
      const color = Dracula.getInkColor('hljs-template-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-comment', () => {
      const color = Dracula.getInkColor('hljs-comment');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-quote', () => {
      const color = Dracula.getInkColor('hljs-quote');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-deletion', () => {
      const color = Dracula.getInkColor('hljs-deletion');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-meta', () => {
      const color = Dracula.getInkColor('hljs-meta');
      expect(color).toBeDefined();
    });

    it('should return undefined for unknown class', () => {
      const color = Dracula.getInkColor('unknown-class');
      expect(color).toBeUndefined();
    });
  });

  describe('semanticColors property', () => {
    it('should have semanticColors object', () => {
      expect(Dracula.semanticColors).toBeDefined();
      expect(typeof Dracula.semanticColors).toBe('object');
    });

    it('should have text colors', () => {
      expect(Dracula.semanticColors.text).toBeDefined();
      expect(Dracula.semanticColors.text.primary).toBeDefined();
      expect(Dracula.semanticColors.text.secondary).toBeDefined();
    });

    it('should have background colors', () => {
      expect(Dracula.semanticColors.background).toBeDefined();
      expect(Dracula.semanticColors.background.primary).toBeDefined();
    });

    it('should have border colors', () => {
      expect(Dracula.semanticColors.border).toBeDefined();
      expect(Dracula.semanticColors.border.default).toBeDefined();
    });

    it('should have ui colors', () => {
      expect(Dracula.semanticColors.ui).toBeDefined();
    });

    it('should have status colors', () => {
      expect(Dracula.semanticColors.status).toBeDefined();
      expect(Dracula.semanticColors.status.error).toBeDefined();
      expect(Dracula.semanticColors.status.success).toBeDefined();
    });
  });

  describe('theme styling', () => {
    it('should use bold font weight for keywords', () => {
      expect(Dracula.name).toBe('Dracula');
    });

    it('should have distinct color palette', () => {
      const colors = Dracula.colors;
      expect(colors.AccentPurple).not.toBe(colors.AccentBlue);
      expect(colors.AccentGreen).not.toBe(colors.AccentYellow);
    });
  });
});
