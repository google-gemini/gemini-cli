/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isWordChar,
  stripUnsafeCharacters,
  clamp,
  dbg,
  calculateInitialCursorPosition,
  offsetToLogicalPos,
  calculateVisualLayout,
  type VisualLayout,
} from './text-buffer-utils.js';

// Mock external dependencies
vi.mock('strip-ansi', () => ({
  // eslint-disable-next-line no-control-regex
  default: vi.fn((str: string) => str.replace(/\u001B\[[0-9;]*m/g, '')),
}));

vi.mock('string-width', () => ({
  default: vi.fn((str: string) => str.length),
}));

vi.mock('./textUtils.js', () => ({
  toCodePoints: vi.fn((str: string) => Array.from(str)),
  cpLen: vi.fn((str: string) => Array.from(str).length),
  cpSlice: vi.fn((str: string, start: number, end?: number) =>
    Array.from(str).slice(start, end).join(''),
  ),
}));

describe('text-buffer-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear console spy between tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['TEXTBUFFER_DEBUG'];
  });

  describe('isWordChar', () => {
    it('should return false for undefined', () => {
      expect(isWordChar(undefined)).toBe(false);
    });

    it('should return true for alphanumeric characters', () => {
      expect(isWordChar('a')).toBe(true);
      expect(isWordChar('Z')).toBe(true);
      expect(isWordChar('5')).toBe(true);
      expect(isWordChar('_')).toBe(true);
    });

    it('should return false for whitespace and punctuation', () => {
      expect(isWordChar(' ')).toBe(false);
      expect(isWordChar(',')).toBe(false);
      expect(isWordChar('.')).toBe(false);
      expect(isWordChar(';')).toBe(false);
      expect(isWordChar('!')).toBe(false);
      expect(isWordChar('?')).toBe(false);
      expect(isWordChar('\t')).toBe(false);
      expect(isWordChar('\n')).toBe(false);
    });
  });

  describe('stripUnsafeCharacters', () => {
    it('should strip ANSI escape codes', () => {
      const input = '\x1b[31mRed text\x1b[0m';
      const result = stripUnsafeCharacters(input);
      expect(result).toBe('Red text');
    });

    it('should remove control characters except line breaks', () => {
      const input = 'Hello\x01World\nNext\rLine\x7f';
      const result = stripUnsafeCharacters(input);
      expect(result).toBe('HelloWorld\nNext\rLine');
    });

    it('should preserve carriage return and line feed', () => {
      const input = 'Line 1\nLine 2\rLine 3';
      const result = stripUnsafeCharacters(input);
      expect(result).toBe('Line 1\nLine 2\rLine 3');
    });

    it('should handle empty string', () => {
      expect(stripUnsafeCharacters('')).toBe('');
    });

    it('should filter characters with length > 1', async () => {
      // This would happen if toCodePoints returned multi-character elements
      const mockToCodePoints = vi.mocked(
        await import('./textUtils.js'),
      ).toCodePoints;
      mockToCodePoints.mockReturnValueOnce(['a', 'bb', 'c']);

      const result = stripUnsafeCharacters('abc');
      expect(result).toBe('ac');
    });
  });

  describe('clamp', () => {
    it('should return the value when within bounds', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });

    it('should return min when value is below minimum', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(-1, 5, 10)).toBe(5);
    });

    it('should return max when value is above maximum', () => {
      expect(clamp(15, 0, 10)).toBe(10);
      expect(clamp(20, 5, 10)).toBe(10);
    });

    it('should handle negative ranges', () => {
      expect(clamp(-5, -10, -1)).toBe(-5);
      expect(clamp(-15, -10, -1)).toBe(-10);
      expect(clamp(0, -10, -1)).toBe(-1);
    });
  });

  describe('dbg', () => {
    it('should not log when DEBUG is false', () => {
      process.env['TEXTBUFFER_DEBUG'] = 'false';
      const consoleSpy = vi.spyOn(console, 'log');

      dbg('test message', 123);

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log when TEXTBUFFER_DEBUG=1', () => {
      process.env['TEXTBUFFER_DEBUG'] = '1';
      const consoleSpy = vi.spyOn(console, 'log');

      dbg('test message', 123);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[TextBuffer]',
        'test message',
        123,
      );
    });

    it('should log when TEXTBUFFER_DEBUG=true', () => {
      process.env['TEXTBUFFER_DEBUG'] = 'true';
      const consoleSpy = vi.spyOn(console, 'log');

      dbg('test', { key: 'value' });

      expect(consoleSpy).toHaveBeenCalledWith('[TextBuffer]', 'test', {
        key: 'value',
      });
    });
  });

  describe('calculateInitialCursorPosition', () => {
    it('should handle empty lines', () => {
      const result = calculateInitialCursorPosition([], 0);
      expect(result).toEqual([0, 0]);
    });

    it('should place cursor at beginning', () => {
      const lines = ['Hello', 'World'];
      const result = calculateInitialCursorPosition(lines, 0);
      expect(result).toEqual([0, 0]);
    });

    it('should place cursor in middle of first line', () => {
      const lines = ['Hello', 'World'];
      const result = calculateInitialCursorPosition(lines, 3);
      expect(result).toEqual([0, 3]);
    });

    it('should place cursor at end of first line', () => {
      const lines = ['Hello', 'World'];
      const result = calculateInitialCursorPosition(lines, 5);
      expect(result).toEqual([0, 5]);
    });

    it('should place cursor at beginning of second line', () => {
      const lines = ['Hello', 'World'];
      const result = calculateInitialCursorPosition(lines, 6); // 5 chars + 1 newline
      expect(result).toEqual([1, 0]);
    });

    it('should place cursor in middle of second line', () => {
      const lines = ['Hello', 'World'];
      const result = calculateInitialCursorPosition(lines, 9); // 5 + 1 + 3
      expect(result).toEqual([1, 3]);
    });

    it('should handle offset beyond text', () => {
      const lines = ['Hello', 'World'];
      const result = calculateInitialCursorPosition(lines, 20);
      expect(result).toEqual([1, 5]); // End of last line
    });

    it('should handle single empty line', () => {
      const lines = [''];
      const result = calculateInitialCursorPosition(lines, 5);
      expect(result).toEqual([0, 0]);
    });
  });

  describe('offsetToLogicalPos', () => {
    it('should return [0, 0] for offset 0', () => {
      const result = offsetToLogicalPos('Hello\nWorld', 0);
      expect(result).toEqual([0, 0]);
    });

    it('should handle position in first line', () => {
      const result = offsetToLogicalPos('Hello\nWorld', 3);
      expect(result).toEqual([0, 3]);
    });

    it('should handle position at end of first line', () => {
      const result = offsetToLogicalPos('Hello\nWorld', 5);
      expect(result).toEqual([0, 5]);
    });

    it('should handle position at newline', () => {
      const result = offsetToLogicalPos('Hello\nWorld', 6);
      expect(result).toEqual([1, 0]);
    });

    it('should handle position in second line', () => {
      const result = offsetToLogicalPos('Hello\nWorld', 8);
      expect(result).toEqual([1, 2]);
    });

    it('should handle empty text', () => {
      const result = offsetToLogicalPos('', 0);
      expect(result).toEqual([0, 0]);
    });

    it('should handle offset beyond text length', () => {
      const result = offsetToLogicalPos('Hello\nWorld', 20);
      expect(result).toEqual([1, 5]); // End of last line
    });

    it('should handle single line text', () => {
      const result = offsetToLogicalPos('Hello', 3);
      expect(result).toEqual([0, 3]);
    });

    it('should handle multiline text with empty lines', () => {
      const result = offsetToLogicalPos('Hello\n\nWorld', 7);
      expect(result).toEqual([2, 0]);
    });
  });

  describe('calculateVisualLayout', () => {
    let mockStringWidth: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      mockStringWidth = vi.mocked(await import('string-width')).default;
      mockStringWidth.mockImplementation((str: string) => str.length);
    });

    it('should handle empty logical lines', () => {
      const result = calculateVisualLayout([], [0, 0], 80);

      expect(result.visualLines).toEqual(['']);
      expect(result.visualCursor).toEqual([0, 0]);
      expect(result.logicalToVisualMap).toEqual([[[0, 0]]]);
      expect(result.visualToLogicalMap).toEqual([[0, 0]]);
    });

    it('should handle single empty line', () => {
      const result = calculateVisualLayout([''], [0, 0], 80);

      expect(result.visualLines).toEqual(['']);
      expect(result.visualCursor).toEqual([0, 0]);
    });

    it('should handle single line that fits', () => {
      const result = calculateVisualLayout(['Hello World'], [0, 5], 80);

      expect(result.visualLines).toEqual(['Hello World']);
      expect(result.visualCursor).toEqual([0, 5]);
      expect(result.logicalToVisualMap[0]).toEqual([[0, 0]]);
      expect(result.visualToLogicalMap).toEqual([[0, 0]]);
    });

    it('should wrap long lines', () => {
      const longLine = 'This is a very long line that should wrap';
      const result = calculateVisualLayout([longLine], [0, 10], 20);

      expect(result.visualLines.length).toBeGreaterThan(1);
      expect(result.logicalToVisualMap[0].length).toBeGreaterThan(1);
    });

    it('should handle word wrapping at spaces', () => {
      const result = calculateVisualLayout(['Hello World Test'], [0, 8], 10);

      // Should break at word boundaries
      expect(result.visualLines[0]).toBe('Hello');
      expect(result.visualLines[1]).toBe('World Test');
    });

    it('should handle character wider than viewport', () => {
      mockStringWidth.mockImplementation((str: string) =>
        str === '🚀' ? 15 : str.length,
      );

      const result = calculateVisualLayout(['🚀'], [0, 0], 10);

      expect(result.visualLines).toEqual(['🚀']);
      expect(result.visualCursor).toEqual([0, 0]);
    });

    it('should handle cursor at end of logical line', () => {
      const result = calculateVisualLayout(['Hello'], [0, 5], 80);

      expect(result.visualCursor).toEqual([0, 5]);
    });

    it('should handle multiple logical lines', () => {
      const result = calculateVisualLayout(['Line 1', 'Line 2'], [1, 3], 80);

      expect(result.visualLines).toEqual(['Line 1', 'Line 2']);
      expect(result.visualCursor).toEqual([1, 3]);
      expect(result.logicalToVisualMap.length).toBe(2);
    });

    it('should advance past space after word wrap', () => {
      const result = calculateVisualLayout(['Hello World Extra'], [0, 15], 10);

      // Should have multiple visual lines due to wrapping
      expect(result.visualLines.length).toBeGreaterThan(1);
      // Should skip spaces used for word breaks
      expect(result.visualLines.join('')).not.toContain('  '); // No double spaces
    });

    it('should handle cursor mapping in wrapped lines', () => {
      const result = calculateVisualLayout(['Hello World Test'], [0, 12], 10);

      // Cursor should be mapped to the correct visual line
      expect(result.visualCursor[0]).toBeGreaterThanOrEqual(0);
      expect(result.visualCursor[1]).toBeGreaterThanOrEqual(0);
    });

    it('should prevent infinite loops with zero-width viewport', () => {
      const result = calculateVisualLayout(['Hello'], [0, 0], 0);

      // Should still produce some output without infinite loop
      expect(result.visualLines.length).toBeGreaterThan(0);
    });
  });

  describe('VisualLayout interface', () => {
    it('should have correct type structure', () => {
      const layout: VisualLayout = {
        visualLines: ['test'],
        visualCursor: [0, 0],
        logicalToVisualMap: [[[0, 0]]],
        visualToLogicalMap: [[0, 0]],
      };

      expect(layout.visualLines).toEqual(['test']);
      expect(layout.visualCursor).toEqual([0, 0]);
      expect(layout.logicalToVisualMap).toEqual([[[0, 0]]]);
      expect(layout.visualToLogicalMap).toEqual([[0, 0]]);
    });
  });
});
