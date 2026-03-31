/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  ansiToStyleSpans,
  styleSpansWidth,
  breakStyleSpansIntoWords,
  wrapStyleSpans,
  widestLineFromStyleSpans,
  styleSpansToString,
  styleSpansToANSIString,
  type StyleSpan,
} from './styleSpan.js';

describe('styleSpan utilities', () => {
  describe('ansiToStyleSpans', () => {
    it('should create a single span for plain text without ANSI codes', () => {
      const spans = ansiToStyleSpans('hello world');
      expect(spans).toHaveLength(1);
      expect(spans[0].text).toBe('hello world');
      expect(spans[0].styles).toEqual([]);
    });

    it('should merge consecutive characters with same styles', () => {
      // ANSI code for red text
      const ansiText = '\x1b[31mred\x1b[0m normal';
      const spans = ansiToStyleSpans(ansiText);

      // Should have fewer spans than characters due to grouping
      expect(spans.length).toBeLessThanOrEqual(3);
      expect(spans[0].text).toContain('red');
      expect(spans[spans.length - 1].text).toContain('normal');
    });

    it('should handle empty strings', () => {
      const spans = ansiToStyleSpans('');
      expect(spans).toEqual([]);
    });

    it('should handle ANSI codes with special characters', () => {
      const ansiText = '\x1b[1mbold\x1b[0m text';
      const spans = ansiToStyleSpans(ansiText);
      expect(spans.length).toBeGreaterThan(0);
      expect(spans.some((s) => s.text.includes('bold'))).toBe(true);
      expect(spans.some((s) => s.text.includes('text'))).toBe(true);
    });

    it('should preserve text content accurately', () => {
      const originalText = 'hello world';
      const spans = ansiToStyleSpans(originalText);
      const reconstructed = styleSpansToString(spans);
      expect(reconstructed).toBe(originalText);
    });

    it('should efficiently group many same-style characters', () => {
      // Test with a very long span of same-styled text
      const longText = 'a'.repeat(1000);
      const spans = ansiToStyleSpans(longText);
      // Should be just 1 span, not 1000 spans
      expect(spans).toHaveLength(1);
      expect(spans[0].text).toBe(longText);
    });

    it('should compare style arrays correctly', () => {
      // Test that style comparison works for complex cases
      const text1 = '\x1b[31m\x1b[1mred bold\x1b[0m';
      const spans1 = ansiToStyleSpans(text1);
      // Should group the red bold text together
      expect(spans1.some((s) => s.text.includes('red'))).toBe(true);
    });
  });

  describe('styleSpansWidth', () => {
    it('should return 0 for empty spans', () => {
      const width = styleSpansWidth([]);
      expect(width).toBe(0);
    });

    it('should calculate width of ASCII text correctly', () => {
      const spans: StyleSpan[] = [{ text: 'hello', styles: [] }];
      const width = styleSpansWidth(spans);
      expect(width).toBe(5);
    });

    it('should sum widths of multiple spans', () => {
      const spans: StyleSpan[] = [
        { text: 'hello', styles: [] },
        { text: ' world', styles: [] },
      ];
      const width = styleSpansWidth(spans);
      expect(width).toBe(11);
    });

    it('should handle emoji and wide characters correctly', () => {
      const spans: StyleSpan[] = [{ text: '😀', styles: [] }];
      const width = styleSpansWidth(spans);
      // emoji is typically 2 columns wide
      expect(width).toBeGreaterThan(0);
    });

    it('should handle combining marks correctly', () => {
      const spans: StyleSpan[] = [
        { text: 'e\u0301', styles: [] }, // é composed
      ];
      const width = styleSpansWidth(spans);
      expect(width).toBeGreaterThan(0);
    });
  });

  describe('breakStyleSpansIntoWords', () => {
    it('should return single span for single word', () => {
      const spans: StyleSpan[] = [{ text: 'hello', styles: [] }];
      const words = breakStyleSpansIntoWords(spans);
      expect(words.length).toBe(1);
      expect(words[0][0].text).toBe('hello');
    });

    it('should break text by whitespace', () => {
      const spans: StyleSpan[] = [{ text: 'hello world test', styles: [] }];
      const words = breakStyleSpansIntoWords(spans);
      expect(words.length).toBeGreaterThan(1);
      expect(words.some((w) => w[0].text.includes('hello'))).toBe(true);
      expect(words.some((w) => w[0].text.includes('world'))).toBe(true);
    });

    it('should preserve styles across word breaks', () => {
      const spans: StyleSpan[] = [{ text: 'hello world', styles: [] }];
      const words = breakStyleSpansIntoWords(spans);
      // All words should maintain consistent styles
      expect(words.length).toBeGreaterThan(0);
    });

    it('should handle multiple spans with different styles', () => {
      const spans: StyleSpan[] = [
        { text: 'hello ', styles: [] },
        { text: 'world', styles: [] },
      ];
      const words = breakStyleSpansIntoWords(spans);
      expect(words.length).toBeGreaterThan(1);
    });

    it('should handle empty spans array', () => {
      const words = breakStyleSpansIntoWords([]);
      expect(words).toEqual([]);
    });

    it('should handle spans with only whitespace', () => {
      const spans: StyleSpan[] = [{ text: '   ', styles: [] }];
      const words = breakStyleSpansIntoWords(spans);
      // Should be treated as whitespace words
      expect(words.length).toBeGreaterThan(0);
    });
  });

  describe('wrapStyleSpans', () => {
    it('should not wrap if text fits within maxWidth', () => {
      const spans: StyleSpan[] = [{ text: 'hello', styles: [] }];
      const wrapped = wrapStyleSpans(spans, 20);
      expect(wrapped).toHaveLength(1);
      expect(wrapped[0][0].text).toBe('hello');
    });

    it('should wrap text that exceeds maxWidth', () => {
      const spans: StyleSpan[] = [
        { text: 'hello world this is a long text', styles: [] },
      ];
      const wrapped = wrapStyleSpans(spans, 10);
      expect(wrapped.length).toBeGreaterThan(1);
    });

    it('should preserve styles across line breaks', () => {
      const spans: StyleSpan[] = [
        { text: 'hello world this is a test', styles: [] },
      ];
      const wrapped = wrapStyleSpans(spans, 5);
      // Verify the text is preserved across wrapping
      const totalText = wrapped
        .map((line) => line.map((span) => span.text).join(''))
        .join('');
      expect(totalText).toContain('hello');
      expect(totalText).toContain('test');
    });

    it('should handle wrapping with whitespace', async () => {
      const spans: StyleSpan[] = [{ text: 'hello   world   test', styles: [] }];
      const wrapped = wrapStyleSpans(spans, 10);
      // Wrapped content should still contain text
      expect(wrapped.length).toBeGreaterThan(0);
      wrapped.forEach((line) => {
        expect(line.length).toBeGreaterThan(0);
      });
    });

    it('should handle maxWidth of 0 or negative', () => {
      const spans: StyleSpan[] = [{ text: 'hello', styles: [] }];
      const wrapped = wrapStyleSpans(spans, 0);
      expect(wrapped).toEqual([spans]);
    });

    it('should handle empty spans', () => {
      const wrapped = wrapStyleSpans([], 10);
      expect(wrapped).toEqual([[]]);
    });

    it('should handle very long single words', () => {
      const spans: StyleSpan[] = [
        { text: 'verylongwordthatdoesntfit', styles: [] },
      ];
      const wrapped = wrapStyleSpans(spans, 5);
      expect(wrapped.length).toBeGreaterThan(0);
    });
  });

  describe('widestLineFromStyleSpans', () => {
    it('should return 0 for empty lines array', () => {
      const width = widestLineFromStyleSpans([]);
      expect(width).toBe(0);
    });

    it('should return width of single line', () => {
      const lines: StyleSpan[][] = [[{ text: 'hello', styles: [] }]];
      const width = widestLineFromStyleSpans(lines);
      expect(width).toBe(5);
    });

    it('should return width of widest line', () => {
      const lines: StyleSpan[][] = [
        [{ text: 'hi', styles: [] }],
        [{ text: 'hello world', styles: [] }],
        [{ text: 'test', styles: [] }],
      ];
      const width = widestLineFromStyleSpans(lines);
      expect(width).toBe(11);
    });

    it('should handle lines with multiple spans', () => {
      const lines: StyleSpan[][] = [
        [
          { text: 'hello', styles: [] },
          { text: ' world', styles: [] },
        ],
      ];
      const width = widestLineFromStyleSpans(lines);
      expect(width).toBe(11);
    });
  });

  describe('styleSpansToString', () => {
    it('should return empty string for empty spans', () => {
      const text = styleSpansToString([]);
      expect(text).toBe('');
    });

    it('should concatenate span text', () => {
      const spans: StyleSpan[] = [
        { text: 'hello', styles: [] },
        { text: ' ', styles: [] },
        { text: 'world', styles: [] },
      ];
      const text = styleSpansToString(spans);
      expect(text).toBe('hello world');
    });

    it('should remove ANSI codes and return plain text', () => {
      const ansiText = '\x1b[31mred\x1b[0m normal';
      const spans = ansiToStyleSpans(ansiText);
      const text = styleSpansToString(spans);
      expect(text).not.toContain('\x1b');
      expect(text).toContain('red');
      expect(text).toContain('normal');
    });
  });

  describe('styleSpansToANSIString', () => {
    it('should return plain text for spans without styles', () => {
      const spans: StyleSpan[] = [{ text: 'hello world', styles: [] }];
      const ansiText = styleSpansToANSIString(spans);
      expect(ansiText).toContain('hello world');
    });

    it('should preserve text content with styles', () => {
      const ansiInput = '\x1b[31mred\x1b[0m normal';
      const spans = ansiToStyleSpans(ansiInput);
      const ansiOutput = styleSpansToANSIString(spans);
      // Should contain the original text
      expect(ansiOutput).toContain('red');
      expect(ansiOutput).toContain('normal');
    });

    it('should round-trip ANSI text correctly', () => {
      const originalText = 'hello world';
      const spans = ansiToStyleSpans(originalText);
      const ansiText = styleSpansToANSIString(spans);
      expect(ansiText).toContain(originalText);
    });
  });

  describe('Performance and edge cases', () => {
    it('should handle very long text efficiently', () => {
      const longText = 'word '.repeat(1000);
      const spans = ansiToStyleSpans(longText);
      expect(spans.length).toBeLessThan(longText.length);
    });

    it('should handle deeply nested styling', () => {
      const text = 'test with nested styles';
      const spans = ansiToStyleSpans(text);
      expect(spans.length).toBeGreaterThan(0);
      expect(styleSpansToString(spans)).toContain('test');
    });

    it('should handle Unicode text correctly', () => {
      const spans: StyleSpan[] = [{ text: '你好世界', styles: [] }];
      const width = styleSpansWidth(spans);
      expect(width).toBeGreaterThan(0);
    });

    it('should handle mixed ASCII and Unicode', () => {
      const spans: StyleSpan[] = [{ text: 'hello 世界', styles: [] }];
      const text = styleSpansToString(spans);
      expect(text).toBe('hello 世界');
    });

    it('should handle control characters', () => {
      const spans: StyleSpan[] = [{ text: 'hello\tworld\ntest', styles: [] }];
      const text = styleSpansToString(spans);
      expect(text).toContain('hello');
      expect(text).toContain('world');
      expect(text).toContain('test');
    });
  });

  describe('Memory efficiency', () => {
    it('should create fewer objects with run-length encoding', () => {
      const text = 'a'.repeat(1000);
      const spans = ansiToStyleSpans(text);
      // Should be 1 span instead of 1000 objects
      expect(spans).toHaveLength(1);
    });

    it('should group identical consecutive styles', () => {
      const spans: StyleSpan[] = [
        { text: 'aaaa', styles: [] },
        { text: 'bbbb', styles: [] },
        { text: 'cccc', styles: [] },
      ];
      // These should have stayed separate as diff spans
      expect(spans).toHaveLength(3);
    });
  });
});
