/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { GitHubLight } from './github-light.js';

describe('GitHubLight theme', () => {
  describe('basic properties', () => {
    it('should have name "GitHub Light"', () => {
      expect(GitHubLight.name).toBe('GitHub Light');
    });

    it('should have type "light"', () => {
      expect(GitHubLight.type).toBe('light');
    });

    it('should be a Theme instance', () => {
      expect(GitHubLight).toBeDefined();
      expect(typeof GitHubLight.getInkColor).toBe('function');
    });
  });

  describe('colors property', () => {
    it('should have colors object', () => {
      expect(GitHubLight.colors).toBeDefined();
      expect(typeof GitHubLight.colors).toBe('object');
    });

    it('should have type "light"', () => {
      expect(GitHubLight.colors.type).toBe('light');
    });

    it('should have Background color', () => {
      expect(GitHubLight.colors.Background).toBe('#f8f8f8');
    });

    it('should have Foreground color', () => {
      expect(GitHubLight.colors.Foreground).toBe('#24292E');
    });

    it('should have LightBlue color', () => {
      expect(GitHubLight.colors.LightBlue).toBe('#0086b3');
    });

    it('should have AccentBlue color', () => {
      expect(GitHubLight.colors.AccentBlue).toBe('#458');
    });

    it('should have AccentPurple color', () => {
      expect(GitHubLight.colors.AccentPurple).toBe('#900');
    });

    it('should have AccentCyan color', () => {
      expect(GitHubLight.colors.AccentCyan).toBe('#009926');
    });

    it('should have AccentGreen color', () => {
      expect(GitHubLight.colors.AccentGreen).toBe('#008080');
    });

    it('should have AccentYellow color', () => {
      expect(GitHubLight.colors.AccentYellow).toBe('#990073');
    });

    it('should have AccentRed color', () => {
      expect(GitHubLight.colors.AccentRed).toBe('#d14');
    });

    it('should have DiffAdded color', () => {
      expect(GitHubLight.colors.DiffAdded).toBe('#C6EAD8');
    });

    it('should have DiffRemoved color', () => {
      expect(GitHubLight.colors.DiffRemoved).toBe('#FFCCCC');
    });

    it('should have Comment color', () => {
      expect(GitHubLight.colors.Comment).toBe('#998');
    });

    it('should have Gray color', () => {
      expect(GitHubLight.colors.Gray).toBe('#999');
    });

    it('should have GradientColors array', () => {
      expect(GitHubLight.colors.GradientColors).toEqual(['#458', '#008080']);
    });

    it('should have two gradient colors', () => {
      expect(GitHubLight.colors.GradientColors).toHaveLength(2);
    });

    it('should have light background color', () => {
      expect(GitHubLight.colors.Background).toContain('f8');
    });
  });

  describe('getInkColor method', () => {
    it('should provide color for hljs-comment', () => {
      const color = GitHubLight.getInkColor('hljs-comment');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-quote', () => {
      const color = GitHubLight.getInkColor('hljs-quote');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-keyword', () => {
      const color = GitHubLight.getInkColor('hljs-keyword');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-tag', () => {
      const color = GitHubLight.getInkColor('hljs-selector-tag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-subst', () => {
      const color = GitHubLight.getInkColor('hljs-subst');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-number', () => {
      const color = GitHubLight.getInkColor('hljs-number');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-literal', () => {
      const color = GitHubLight.getInkColor('hljs-literal');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-variable', () => {
      const color = GitHubLight.getInkColor('hljs-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-template-variable', () => {
      const color = GitHubLight.getInkColor('hljs-template-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-string', () => {
      const color = GitHubLight.getInkColor('hljs-string');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-doctag', () => {
      const color = GitHubLight.getInkColor('hljs-doctag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-title', () => {
      const color = GitHubLight.getInkColor('hljs-title');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-section', () => {
      const color = GitHubLight.getInkColor('hljs-section');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-id', () => {
      const color = GitHubLight.getInkColor('hljs-selector-id');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-type', () => {
      const color = GitHubLight.getInkColor('hljs-type');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-tag', () => {
      const color = GitHubLight.getInkColor('hljs-tag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-name', () => {
      const color = GitHubLight.getInkColor('hljs-name');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-attribute', () => {
      const color = GitHubLight.getInkColor('hljs-attribute');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-regexp', () => {
      const color = GitHubLight.getInkColor('hljs-regexp');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-link', () => {
      const color = GitHubLight.getInkColor('hljs-link');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-symbol', () => {
      const color = GitHubLight.getInkColor('hljs-symbol');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-bullet', () => {
      const color = GitHubLight.getInkColor('hljs-bullet');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-built_in', () => {
      const color = GitHubLight.getInkColor('hljs-built_in');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-builtin-name', () => {
      const color = GitHubLight.getInkColor('hljs-builtin-name');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-meta', () => {
      const color = GitHubLight.getInkColor('hljs-meta');
      expect(color).toBeDefined();
    });

    it('should return undefined for unknown class', () => {
      const color = GitHubLight.getInkColor('unknown-class');
      expect(color).toBeUndefined();
    });
  });

  describe('semanticColors property', () => {
    it('should have semanticColors object', () => {
      expect(GitHubLight.semanticColors).toBeDefined();
      expect(typeof GitHubLight.semanticColors).toBe('object');
    });

    it('should have text colors', () => {
      expect(GitHubLight.semanticColors.text).toBeDefined();
      expect(GitHubLight.semanticColors.text.primary).toBeDefined();
      expect(GitHubLight.semanticColors.text.secondary).toBeDefined();
    });

    it('should have background colors', () => {
      expect(GitHubLight.semanticColors.background).toBeDefined();
      expect(GitHubLight.semanticColors.background.primary).toBeDefined();
    });

    it('should have border colors', () => {
      expect(GitHubLight.semanticColors.border).toBeDefined();
      expect(GitHubLight.semanticColors.border.default).toBeDefined();
    });

    it('should have ui colors', () => {
      expect(GitHubLight.semanticColors.ui).toBeDefined();
    });

    it('should have status colors', () => {
      expect(GitHubLight.semanticColors.status).toBeDefined();
      expect(GitHubLight.semanticColors.status.error).toBeDefined();
      expect(GitHubLight.semanticColors.status.success).toBeDefined();
    });
  });
});
