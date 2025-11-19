/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { GitHubDark } from './github-dark.js';

describe('GitHubDark theme', () => {
  describe('basic properties', () => {
    it('should have name "GitHub"', () => {
      expect(GitHubDark.name).toBe('GitHub');
    });

    it('should have type "dark"', () => {
      expect(GitHubDark.type).toBe('dark');
    });

    it('should be a Theme instance', () => {
      expect(GitHubDark).toBeDefined();
      expect(typeof GitHubDark.getInkColor).toBe('function');
    });
  });

  describe('colors property', () => {
    it('should have colors object', () => {
      expect(GitHubDark.colors).toBeDefined();
      expect(typeof GitHubDark.colors).toBe('object');
    });

    it('should have type "dark"', () => {
      expect(GitHubDark.colors.type).toBe('dark');
    });

    it('should have Background color', () => {
      expect(GitHubDark.colors.Background).toBe('#24292e');
    });

    it('should have Foreground color', () => {
      expect(GitHubDark.colors.Foreground).toBe('#c0c4c8');
    });

    it('should have LightBlue color', () => {
      expect(GitHubDark.colors.LightBlue).toBe('#79B8FF');
    });

    it('should have AccentBlue color', () => {
      expect(GitHubDark.colors.AccentBlue).toBe('#79B8FF');
    });

    it('should have AccentPurple color', () => {
      expect(GitHubDark.colors.AccentPurple).toBe('#B392F0');
    });

    it('should have AccentCyan color', () => {
      expect(GitHubDark.colors.AccentCyan).toBe('#9ECBFF');
    });

    it('should have AccentGreen color', () => {
      expect(GitHubDark.colors.AccentGreen).toBe('#85E89D');
    });

    it('should have AccentYellow color', () => {
      expect(GitHubDark.colors.AccentYellow).toBe('#FFAB70');
    });

    it('should have AccentRed color', () => {
      expect(GitHubDark.colors.AccentRed).toBe('#F97583');
    });

    it('should have DiffAdded color', () => {
      expect(GitHubDark.colors.DiffAdded).toBe('#3C4636');
    });

    it('should have DiffRemoved color', () => {
      expect(GitHubDark.colors.DiffRemoved).toBe('#502125');
    });

    it('should have Comment color', () => {
      expect(GitHubDark.colors.Comment).toBe('#6A737D');
    });

    it('should have Gray color', () => {
      expect(GitHubDark.colors.Gray).toBe('#6A737D');
    });

    it('should have GradientColors array', () => {
      expect(GitHubDark.colors.GradientColors).toEqual(['#79B8FF', '#85E89D']);
    });

    it('should have two gradient colors', () => {
      expect(GitHubDark.colors.GradientColors).toHaveLength(2);
    });

    it('should have dark background color', () => {
      expect(GitHubDark.colors.Background).toContain('24292e');
    });
  });

  describe('getInkColor method', () => {
    it('should provide color for hljs-comment', () => {
      const color = GitHubDark.getInkColor('hljs-comment');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-quote', () => {
      const color = GitHubDark.getInkColor('hljs-quote');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-keyword', () => {
      const color = GitHubDark.getInkColor('hljs-keyword');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-tag', () => {
      const color = GitHubDark.getInkColor('hljs-selector-tag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-subst', () => {
      const color = GitHubDark.getInkColor('hljs-subst');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-number', () => {
      const color = GitHubDark.getInkColor('hljs-number');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-literal', () => {
      const color = GitHubDark.getInkColor('hljs-literal');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-variable', () => {
      const color = GitHubDark.getInkColor('hljs-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-template-variable', () => {
      const color = GitHubDark.getInkColor('hljs-template-variable');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-string', () => {
      const color = GitHubDark.getInkColor('hljs-string');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-doctag', () => {
      const color = GitHubDark.getInkColor('hljs-doctag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-title', () => {
      const color = GitHubDark.getInkColor('hljs-title');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-section', () => {
      const color = GitHubDark.getInkColor('hljs-section');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-selector-id', () => {
      const color = GitHubDark.getInkColor('hljs-selector-id');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-type', () => {
      const color = GitHubDark.getInkColor('hljs-type');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-tag', () => {
      const color = GitHubDark.getInkColor('hljs-tag');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-name', () => {
      const color = GitHubDark.getInkColor('hljs-name');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-attribute', () => {
      const color = GitHubDark.getInkColor('hljs-attribute');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-regexp', () => {
      const color = GitHubDark.getInkColor('hljs-regexp');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-link', () => {
      const color = GitHubDark.getInkColor('hljs-link');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-symbol', () => {
      const color = GitHubDark.getInkColor('hljs-symbol');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-bullet', () => {
      const color = GitHubDark.getInkColor('hljs-bullet');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-built_in', () => {
      const color = GitHubDark.getInkColor('hljs-built_in');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-builtin-name', () => {
      const color = GitHubDark.getInkColor('hljs-builtin-name');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-meta', () => {
      const color = GitHubDark.getInkColor('hljs-meta');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-deletion', () => {
      const color = GitHubDark.getInkColor('hljs-deletion');
      expect(color).toBeDefined();
    });

    it('should provide color for hljs-addition', () => {
      const color = GitHubDark.getInkColor('hljs-addition');
      expect(color).toBeDefined();
    });

    it('should return undefined for unknown class', () => {
      const color = GitHubDark.getInkColor('unknown-class');
      expect(color).toBeUndefined();
    });
  });

  describe('semanticColors property', () => {
    it('should have semanticColors object', () => {
      expect(GitHubDark.semanticColors).toBeDefined();
      expect(typeof GitHubDark.semanticColors).toBe('object');
    });

    it('should have text colors', () => {
      expect(GitHubDark.semanticColors.text).toBeDefined();
      expect(GitHubDark.semanticColors.text.primary).toBeDefined();
      expect(GitHubDark.semanticColors.text.secondary).toBeDefined();
    });

    it('should have background colors', () => {
      expect(GitHubDark.semanticColors.background).toBeDefined();
      expect(GitHubDark.semanticColors.background.primary).toBeDefined();
    });

    it('should have border colors', () => {
      expect(GitHubDark.semanticColors.border).toBeDefined();
      expect(GitHubDark.semanticColors.border.default).toBeDefined();
    });

    it('should have ui colors', () => {
      expect(GitHubDark.semanticColors.ui).toBeDefined();
    });

    it('should have status colors', () => {
      expect(GitHubDark.semanticColors.status).toBeDefined();
      expect(GitHubDark.semanticColors.status.error).toBeDefined();
      expect(GitHubDark.semanticColors.status.success).toBeDefined();
    });
  });
});
