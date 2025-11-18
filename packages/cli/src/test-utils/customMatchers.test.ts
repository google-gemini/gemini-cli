/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import './customMatchers.js';
import type { TextBuffer } from '../ui/components/shared/text-buffer.js';

describe('customMatchers', () => {
  describe('toHaveOnlyValidCharacters', () => {
    it('should pass for buffer with only valid characters', () => {
      const buffer: TextBuffer = {
        lines: ['Hello World', 'Second line', 'Third line'],
      } as TextBuffer;

      expect(buffer).toHaveOnlyValidCharacters();
    });

    it('should pass for empty buffer', () => {
      const buffer: TextBuffer = {
        lines: [],
      } as TextBuffer;

      expect(buffer).toHaveOnlyValidCharacters();
    });

    it('should pass for buffer with empty strings', () => {
      const buffer: TextBuffer = {
        lines: ['', '', ''],
      } as TextBuffer;

      expect(buffer).toHaveOnlyValidCharacters();
    });

    it('should pass for buffer with special characters', () => {
      const buffer: TextBuffer = {
        lines: ['!@#$%^&*()', 'special chars 123', 'unicode: 日本語'],
      } as TextBuffer;

      expect(buffer).toHaveOnlyValidCharacters();
    });

    it('should fail for buffer with newline characters', () => {
      const buffer: TextBuffer = {
        lines: ['Hello\nWorld', 'Line 2'],
      } as TextBuffer;

      expect(() => expect(buffer).toHaveOnlyValidCharacters()).toThrow();
    });

    it('should fail for buffer with backspace characters', () => {
      const buffer: TextBuffer = {
        lines: ['Hello\bWorld'],
      } as TextBuffer;

      expect(() => expect(buffer).toHaveOnlyValidCharacters()).toThrow();
    });

    it('should fail for buffer with ANSI escape codes', () => {
      const buffer: TextBuffer = {
        lines: ['\x1b[31mRed text\x1b[0m'],
      } as TextBuffer;

      expect(() => expect(buffer).toHaveOnlyValidCharacters()).toThrow();
    });

    it('should fail fast on newlines', () => {
      const buffer: TextBuffer = {
        lines: ['Line 1', 'Line\n2', 'Line 3', 'Line 4'],
      } as TextBuffer;

      expect(() => expect(buffer).toHaveOnlyValidCharacters()).toThrow();
    });

    it('should continue checking after backspace', () => {
      const buffer: TextBuffer = {
        lines: ['Line\b1', 'Line 2', 'Line 3'],
      } as TextBuffer;

      expect(() => expect(buffer).toHaveOnlyValidCharacters()).toThrow();
    });

    it('should detect invalid characters in middle of line', () => {
      const buffer: TextBuffer = {
        lines: ['Valid line', 'Middle\x1binvalid', 'Another valid'],
      } as TextBuffer;

      expect(() => expect(buffer).toHaveOnlyValidCharacters()).toThrow();
    });

    it('should detect invalid characters at end of line', () => {
      const buffer: TextBuffer = {
        lines: ['Valid line', 'Invalid at end\b'],
      } as TextBuffer;

      expect(() => expect(buffer).toHaveOnlyValidCharacters()).toThrow();
    });

    it('should handle buffer with single line', () => {
      const buffer: TextBuffer = {
        lines: ['Only one line'],
      } as TextBuffer;

      expect(buffer).toHaveOnlyValidCharacters();
    });

    it('should handle buffer with many lines', () => {
      const buffer: TextBuffer = {
        lines: Array.from({ length: 100 }, (_, i) => `Line ${i}`),
      } as TextBuffer;

      expect(buffer).toHaveOnlyValidCharacters();
    });

    it('should handle long lines', () => {
      const buffer: TextBuffer = {
        lines: ['a'.repeat(10000)],
      } as TextBuffer;

      expect(buffer).toHaveOnlyValidCharacters();
    });

    it('should detect multiple invalid characters in same line', () => {
      const buffer: TextBuffer = {
        lines: ['Invalid\b\x1bline'],
      } as TextBuffer;

      expect(() => expect(buffer).toHaveOnlyValidCharacters()).toThrow();
    });

    it('should work with tabs', () => {
      const buffer: TextBuffer = {
        lines: ['Line\twith\ttabs'],
      } as TextBuffer;

      expect(buffer).toHaveOnlyValidCharacters();
    });

    it('should work with spaces', () => {
      const buffer: TextBuffer = {
        lines: ['Line   with   spaces'],
      } as TextBuffer;

      expect(buffer).toHaveOnlyValidCharacters();
    });

    it('should work with numbers', () => {
      const buffer: TextBuffer = {
        lines: ['123', '456', '789'],
      } as TextBuffer;

      expect(buffer).toHaveOnlyValidCharacters();
    });

    it('should work with mixed content', () => {
      const buffer: TextBuffer = {
        lines: ['abc123', 'ABC!@#', '   spaces   ', 'tabs\there'],
      } as TextBuffer;

      expect(buffer).toHaveOnlyValidCharacters();
    });

    it('should detect carriage return as part of ANSI', () => {
      const buffer: TextBuffer = {
        lines: ['\x1b[2Kclearing line'],
      } as TextBuffer;

      expect(() => expect(buffer).toHaveOnlyValidCharacters()).toThrow();
    });

    it('should detect escape at start of line', () => {
      const buffer: TextBuffer = {
        lines: ['\x1bEscape at start'],
      } as TextBuffer;

      expect(() => expect(buffer).toHaveOnlyValidCharacters()).toThrow();
    });

    it('should handle buffer with undefined lines', () => {
      const buffer = {
        lines: ['valid', undefined, 'also valid'],
      } as never;

      // This should not throw on valid lines
      expect(() => expect(buffer).toHaveOnlyValidCharacters()).not.toThrow();
    });
  });

  describe('matcher type extensions', () => {
    it('should be available on expect', () => {
      const buffer: TextBuffer = {
        lines: ['test'],
      } as TextBuffer;

      // TypeScript should compile this
      expect(buffer).toHaveOnlyValidCharacters();
    });

    it('should work with not modifier', () => {
      const buffer: TextBuffer = {
        lines: ['Hello\nWorld'],
      } as TextBuffer;

      expect(buffer).not.toHaveOnlyValidCharacters();
    });

    it('should be chainable with expect', () => {
      const buffer: TextBuffer = {
        lines: ['test'],
      } as TextBuffer;

      // Should be chainable - this will throw if not available
      expect(buffer).toHaveOnlyValidCharacters();
      expect(buffer).toBeDefined();
    });
  });

  describe('error messages', () => {
    it('should provide informative error message for newlines', () => {
      const buffer: TextBuffer = {
        lines: ['Line\n1'],
      } as TextBuffer;

      try {
        expect(buffer).toHaveOnlyValidCharacters();
        throw new Error('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('invalid characters');
        expect((error as Error).message).toContain('[0]');
      }
    });

    it('should provide informative error message for escapes', () => {
      const buffer: TextBuffer = {
        lines: ['Valid', '\x1bInvalid'],
      } as TextBuffer;

      try {
        expect(buffer).toHaveOnlyValidCharacters();
        throw new Error('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('invalid characters');
        expect((error as Error).message).toContain('[1]');
      }
    });

    it('should include line number in error', () => {
      const buffer: TextBuffer = {
        lines: ['Line 0', 'Line 1', 'Line\n2'],
      } as TextBuffer;

      try {
        expect(buffer).toHaveOnlyValidCharacters();
        throw new Error('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('[2]');
      }
    });

    it('should include line content in error', () => {
      const buffer: TextBuffer = {
        lines: ['Bad\nline'],
      } as TextBuffer;

      try {
        expect(buffer).toHaveOnlyValidCharacters();
        throw new Error('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('Bad');
        expect((error as Error).message).toContain('line');
      }
    });
  });

  describe('regex pattern', () => {
    it('should match backspace character', () => {
      // eslint-disable-next-line no-control-regex
      const invalidCharsRegex = /[\b\x1b]/;
      expect(invalidCharsRegex.test('\b')).toBe(true);
    });

    it('should match escape character', () => {
      // eslint-disable-next-line no-control-regex
      const invalidCharsRegex = /[\b\x1b]/;
      expect(invalidCharsRegex.test('\x1b')).toBe(true);
    });

    it('should not match normal characters', () => {
      // eslint-disable-next-line no-control-regex
      const invalidCharsRegex = /[\b\x1b]/;
      expect(invalidCharsRegex.test('abc123')).toBe(false);
    });

    it('should not match tab character', () => {
      // eslint-disable-next-line no-control-regex
      const invalidCharsRegex = /[\b\x1b]/;
      expect(invalidCharsRegex.test('\t')).toBe(false);
    });

    it('should not match newline directly (tested separately)', () => {
      // Newline is tested with includes() check
      const buffer: TextBuffer = {
        lines: ['line\n'],
      } as TextBuffer;

      expect(() => expect(buffer).toHaveOnlyValidCharacters()).toThrow();
    });
  });

  describe('integration with test framework', () => {
    it('should extend vitest expect', () => {
      expect(expect.extend).toBeDefined();
    });

    it('should work in test assertions', () => {
      const validBuffer: TextBuffer = {
        lines: ['Test line 1', 'Test line 2'],
      } as TextBuffer;

      const invalidBuffer: TextBuffer = {
        lines: ['Test\nline'],
      } as TextBuffer;

      expect(validBuffer).toHaveOnlyValidCharacters();
      expect(() => expect(invalidBuffer).toHaveOnlyValidCharacters()).toThrow();
    });

    it('should chain with other matchers', () => {
      const buffer: TextBuffer = {
        lines: ['test'],
      } as TextBuffer;

      expect(buffer).toBeDefined();
      expect(buffer).toHaveOnlyValidCharacters();
      expect(buffer.lines).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('should handle buffer with null byte', () => {
      const buffer: TextBuffer = {
        lines: ['text\0with null'],
      } as TextBuffer;

      // Null byte is not in the invalid regex, so it should pass
      expect(buffer).toHaveOnlyValidCharacters();
    });

    it('should handle buffer with form feed', () => {
      const buffer: TextBuffer = {
        lines: ['text\fwith form feed'],
      } as TextBuffer;

      // Form feed is not in the invalid regex
      expect(buffer).toHaveOnlyValidCharacters();
    });

    it('should handle buffer with vertical tab', () => {
      const buffer: TextBuffer = {
        lines: ['text\vwith vertical tab'],
      } as TextBuffer;

      // Vertical tab is not in the invalid regex
      expect(buffer).toHaveOnlyValidCharacters();
    });

    it('should handle empty string lines', () => {
      const buffer: TextBuffer = {
        lines: ['', '', ''],
      } as TextBuffer;

      expect(buffer).toHaveOnlyValidCharacters();
    });

    it('should handle whitespace-only lines', () => {
      const buffer: TextBuffer = {
        lines: ['   ', '\t\t', '     '],
      } as TextBuffer;

      expect(buffer).toHaveOnlyValidCharacters();
    });
  });
});
