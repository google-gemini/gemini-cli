/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type {
  SerializableConfirmationDetails,
  ToolEditConfirmationDetails,
} from '@google/gemini-cli-core';
import {
  escapeAnsiCtrlCodes,
  stripUnsafeCharacters,
  getCachedStringWidth,
  sanitizeForDisplay,
} from './textUtils.js';

describe('textUtils', () => {
  describe('sanitizeForListDisplay', () => {
    it('should strip ANSI codes and replace newlines/tabs with spaces', () => {
      const input = '\u001b[31mLine 1\nLine 2\tTabbed\r\nEnd\u001b[0m';
      expect(sanitizeForDisplay(input)).toBe('Line 1 Line 2 Tabbed End');
    });

    it('should collapse multiple consecutive whitespace characters into a single space', () => {
      const input = 'Multiple \n\n newlines and \t\t tabs';
      expect(sanitizeForDisplay(input)).toBe('Multiple newlines and tabs');
    });

    it('should truncate long strings', () => {
      const longInput = 'a'.repeat(50);
      expect(sanitizeForDisplay(longInput, 20)).toBe('a'.repeat(17) + '...');
    });

    it('should handle empty or null input', () => {
      expect(sanitizeForDisplay('')).toBe('');
      expect(sanitizeForDisplay(null as unknown as string)).toBe('');
    });

    it('should strip control characters like backspace', () => {
      const input = 'Hello\x08 World';
      expect(sanitizeForDisplay(input)).toBe('Hello World');
    });
  });

  describe('getCachedStringWidth', () => {
    it('should handle unicode characters that crash string-width', () => {
      // U+0602 caused string-width to crash (see #16418)
      const char = '؂';
      expect(getCachedStringWidth(char)).toBe(1);
    });

    it('should handle unicode characters that crash string-width with ANSI codes', () => {
      const charWithAnsi = '\u001b[31m' + '؂' + '\u001b[0m';
      expect(getCachedStringWidth(charWithAnsi)).toBe(1);
    });
  });

  describe('stripUnsafeCharacters', () => {
    describe('preserved characters', () => {
      it('should preserve TAB (0x09)', () => {
        const input = 'hello\tworld';
        expect(stripUnsafeCharacters(input)).toBe('hello\tworld');
      });

      it('should preserve LF/newline (0x0A)', () => {
        const input = 'hello\nworld';
        expect(stripUnsafeCharacters(input)).toBe('hello\nworld');
      });

      it('should preserve CR (0x0D)', () => {
        const input = 'hello\rworld';
        expect(stripUnsafeCharacters(input)).toBe('hello\rworld');
      });

      it('should preserve CRLF (0x0D 0x0A)', () => {
        const input = 'hello\r\nworld';
        expect(stripUnsafeCharacters(input)).toBe('hello\r\nworld');
      });

      it('should preserve DEL (0x7F)', () => {
        const input = 'hello\x7Fworld';
        expect(stripUnsafeCharacters(input)).toBe('hello\x7Fworld');
      });

      it('should preserve all printable ASCII (0x20-0x7E)', () => {
        const printableAscii =
          ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
        expect(stripUnsafeCharacters(printableAscii)).toBe(printableAscii);
      });

      it('should preserve Unicode characters above 0x9F', () => {
        const input = 'Hello κόσμε 世界 🌍';
        expect(stripUnsafeCharacters(input)).toBe('Hello κόσμε 世界 🌍');
      });

      it('should preserve emojis', () => {
        const input = '🎉 Celebration! 🚀 Launch! 💯';
        expect(stripUnsafeCharacters(input)).toBe(
          '🎉 Celebration! 🚀 Launch! 💯',
        );
      });

      it('should preserve complex emoji sequences (ZWJ)', () => {
        const input = 'Family: 👨‍👩‍👧‍👦 Flag: 🏳️‍🌈';
        expect(stripUnsafeCharacters(input)).toBe('Family: 👨‍👩‍👧‍👦 Flag: 🏳️‍🌈');
      });
    });

    describe('stripped C0 control characters (0x00-0x1F except TAB/LF/CR)', () => {
      it('should strip NULL (0x00)', () => {
        const input = 'hello\x00world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip SOH (0x01)', () => {
        const input = 'hello\x01world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip STX (0x02)', () => {
        const input = 'hello\x02world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip ETX (0x03)', () => {
        const input = 'hello\x03world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip EOT (0x04)', () => {
        const input = 'hello\x04world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip ENQ (0x05)', () => {
        const input = 'hello\x05world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip ACK (0x06)', () => {
        const input = 'hello\x06world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip BELL (0x07)', () => {
        const input = 'hello\x07world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip BACKSPACE (0x08)', () => {
        const input = 'hello\x08world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip VT/Vertical Tab (0x0B)', () => {
        const input = 'hello\x0Bworld';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip FF/Form Feed (0x0C)', () => {
        const input = 'hello\x0Cworld';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip SO (0x0E)', () => {
        const input = 'hello\x0Eworld';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip SI (0x0F)', () => {
        const input = 'hello\x0Fworld';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip DLE (0x10)', () => {
        const input = 'hello\x10world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip DC1 (0x11)', () => {
        const input = 'hello\x11world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip DC2 (0x12)', () => {
        const input = 'hello\x12world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip DC3 (0x13)', () => {
        const input = 'hello\x13world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip DC4 (0x14)', () => {
        const input = 'hello\x14world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip NAK (0x15)', () => {
        const input = 'hello\x15world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip SYN (0x16)', () => {
        const input = 'hello\x16world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip ETB (0x17)', () => {
        const input = 'hello\x17world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip CAN (0x18)', () => {
        const input = 'hello\x18world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip EM (0x19)', () => {
        const input = 'hello\x19world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip SUB (0x1A)', () => {
        const input = 'hello\x1Aworld';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip FS (0x1C)', () => {
        const input = 'hello\x1Cworld';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip GS (0x1D)', () => {
        const input = 'hello\x1Dworld';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip RS (0x1E)', () => {
        const input = 'hello\x1Eworld';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip US (0x1F)', () => {
        const input = 'hello\x1Fworld';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });
    });

    describe('stripped C1 control characters (0x80-0x9F)', () => {
      it('should strip all C1 control characters', () => {
        // Test a few representative C1 control chars
        expect(stripUnsafeCharacters('hello\x80world')).toBe('helloworld');
        expect(stripUnsafeCharacters('hello\x85world')).toBe('helloworld'); // NEL
        expect(stripUnsafeCharacters('hello\x8Aworld')).toBe('helloworld');
        expect(stripUnsafeCharacters('hello\x90world')).toBe('helloworld');
        expect(stripUnsafeCharacters('hello\x9Fworld')).toBe('helloworld');
      });

      it('should preserve characters at 0xA0 and above (non-C1)', () => {
        // 0xA0 is non-breaking space, should be preserved
        expect(stripUnsafeCharacters('hello\xA0world')).toBe('hello\xA0world');
      });
    });

    describe('ANSI escape sequence stripping', () => {
      it('should strip ANSI color codes', () => {
        const input = '\x1b[31mRed\x1b[0m text';
        expect(stripUnsafeCharacters(input)).toBe('Red text');
      });

      it('should strip ANSI cursor movement codes', () => {
        const input = 'hello\x1b[9D\x1b[Kworld';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should strip complex ANSI sequences', () => {
        const input = '\x1b[1;32;40mBold Green on Black\x1b[0m';
        expect(stripUnsafeCharacters(input)).toBe('Bold Green on Black');
      });
    });

    describe('multiple control characters', () => {
      it('should strip multiple different control characters', () => {
        const input = 'a\x00b\x01c\x02d\x07e\x08f';
        expect(stripUnsafeCharacters(input)).toBe('abcdef');
      });

      it('should handle consecutive control characters', () => {
        const input = 'hello\x00\x01\x02\x03\x04world';
        expect(stripUnsafeCharacters(input)).toBe('helloworld');
      });

      it('should handle mixed preserved and stripped chars', () => {
        const input = 'line1\n\x00line2\t\x07line3\r\n';
        expect(stripUnsafeCharacters(input)).toBe('line1\nline2\tline3\r\n');
      });
    });

    describe('edge cases', () => {
      it('should handle empty string', () => {
        expect(stripUnsafeCharacters('')).toBe('');
      });

      it('should handle string with only control characters', () => {
        expect(stripUnsafeCharacters('\x00\x01\x02\x03')).toBe('');
      });

      it('should handle string with only preserved whitespace', () => {
        expect(stripUnsafeCharacters('\t\n\r')).toBe('\t\n\r');
      });

      it('should handle very long strings efficiently', () => {
        const longString = 'a'.repeat(10000) + '\x00' + 'b'.repeat(10000);
        const result = stripUnsafeCharacters(longString);
        expect(result).toBe('a'.repeat(10000) + 'b'.repeat(10000));
        expect(result.length).toBe(20000);
      });

      it('should handle surrogate pairs correctly', () => {
        // 𝌆 is outside BMP (U+1D306)
        const input = '𝌆hello𝌆';
        expect(stripUnsafeCharacters(input)).toBe('𝌆hello𝌆');
      });

      it('should handle mixed BMP and non-BMP characters', () => {
        const input = 'Hello 世界 🌍 привет';
        expect(stripUnsafeCharacters(input)).toBe('Hello 世界 🌍 привет');
      });
    });

    describe('BiDi and deceptive Unicode characters', () => {
      it('should strip BiDi override characters', () => {
        const input = 'safe\u202Etxt.sh';
        // When stripped, it should be 'safetxt.sh'
        expect(stripUnsafeCharacters(input)).toBe('safetxt.sh');
      });

      it('should strip all BiDi control characters (LRM, RLM, U+202A-U+202E, U+2066-U+2069)', () => {
        const bidiChars =
          '\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069';
        expect(stripUnsafeCharacters('a' + bidiChars + 'b')).toBe('ab');
      });

      it('should strip zero-width characters (U+200B, U+FEFF)', () => {
        const zeroWidthChars = '\u200B\uFEFF';
        expect(stripUnsafeCharacters('a' + zeroWidthChars + 'b')).toBe('ab');
      });

      it('should preserve ZWJ (U+200D) for complex emojis', () => {
        const input = 'Family: 👨‍👩‍👧‍👦';
        expect(stripUnsafeCharacters(input)).toBe('Family: 👨‍👩‍👧‍👦');
      });

      it('should preserve ZWNJ (U+200C)', () => {
        const input = 'hello\u200Cworld';
        expect(stripUnsafeCharacters(input)).toBe('hello\u200Cworld');
      });
    });

    describe('performance: regex vs array-based', () => {
      it('should handle real-world terminal output with control chars', () => {
        // Simulate terminal output with various control sequences
        const terminalOutput =
          '\x1b[32mSuccess:\x1b[0m File saved\x07\n\x1b[?25hDone';
        expect(stripUnsafeCharacters(terminalOutput)).toBe(
          'Success: File saved\nDone',
        );
      });
    });
  });
  describe('escapeAnsiCtrlCodes', () => {
    describe('escapeAnsiCtrlCodes string case study', () => {
      it('should replace ANSI escape codes with a visible representation', () => {
        const text = '\u001b[31mHello\u001b[0m';
        const expected = '\\u001b[31mHello\\u001b[0m';
        expect(escapeAnsiCtrlCodes(text)).toBe(expected);

        const text2 = "sh -e 'good && bad# \u001b[9D\u001b[K && good";
        const expected2 = "sh -e 'good && bad# \\u001b[9D\\u001b[K && good";
        expect(escapeAnsiCtrlCodes(text2)).toBe(expected2);
      });

      it('should not change a string with no ANSI codes', () => {
        const text = 'Hello, world!';
        expect(escapeAnsiCtrlCodes(text)).toBe(text);
      });

      it('should handle an empty string', () => {
        expect(escapeAnsiCtrlCodes('')).toBe('');
      });

      describe('toolConfirmationDetails case study', () => {
        it('should sanitize command and rootCommand for exec type', () => {
          const details: SerializableConfirmationDetails = {
            title: '\u001b[34mfake-title\u001b[0m',
            type: 'exec',
            command: '\u001b[31mmls -l\u001b[0m',
            rootCommand: '\u001b[32msudo apt-get update\u001b[0m',
            rootCommands: ['sudo'],
          };

          const sanitized = escapeAnsiCtrlCodes(details);

          if (sanitized.type === 'exec') {
            expect(sanitized.title).toBe('\\u001b[34mfake-title\\u001b[0m');
            expect(sanitized.command).toBe('\\u001b[31mmls -l\\u001b[0m');
            expect(sanitized.rootCommand).toBe(
              '\\u001b[32msudo apt-get update\\u001b[0m',
            );
          }
        });

        it('should sanitize properties for edit type', () => {
          const details: SerializableConfirmationDetails = {
            type: 'edit',
            title: '\u001b[34mEdit File\u001b[0m',
            fileName: '\u001b[31mfile.txt\u001b[0m',
            filePath: '/path/to/\u001b[32mfile.txt\u001b[0m',
            fileDiff:
              'diff --git a/file.txt b/file.txt\n--- a/\u001b[33mfile.txt\u001b[0m\n+++ b/file.txt',
          } as unknown as ToolEditConfirmationDetails;

          const sanitized = escapeAnsiCtrlCodes(details);

          if (sanitized.type === 'edit') {
            expect(sanitized.title).toBe('\\u001b[34mEdit File\\u001b[0m');
            expect(sanitized.fileName).toBe('\\u001b[31mfile.txt\\u001b[0m');
            expect(sanitized.filePath).toBe(
              '/path/to/\\u001b[32mfile.txt\\u001b[0m',
            );
            expect(sanitized.fileDiff).toBe(
              'diff --git a/file.txt b/file.txt\n--- a/\\u001b[33mfile.txt\\u001b[0m\n+++ b/file.txt',
            );
          }
        });

        it('should sanitize properties for mcp type', () => {
          const details: SerializableConfirmationDetails = {
            type: 'mcp',
            title: '\u001b[34mCloud Run\u001b[0m',
            serverName: '\u001b[31mmy-server\u001b[0m',
            toolName: '\u001b[32mdeploy\u001b[0m',
            toolDisplayName: '\u001b[33mDeploy Service\u001b[0m',
          };

          const sanitized = escapeAnsiCtrlCodes(details);

          if (sanitized.type === 'mcp') {
            expect(sanitized.title).toBe('\\u001b[34mCloud Run\\u001b[0m');
            expect(sanitized.serverName).toBe('\\u001b[31mmy-server\\u001b[0m');
            expect(sanitized.toolName).toBe('\\u001b[32mdeploy\\u001b[0m');
            expect(sanitized.toolDisplayName).toBe(
              '\\u001b[33mDeploy Service\\u001b[0m',
            );
          }
        });

        it('should sanitize properties for info type', () => {
          const details: SerializableConfirmationDetails = {
            type: 'info',
            title: '\u001b[34mWeb Search\u001b[0m',
            prompt: '\u001b[31mSearch for cats\u001b[0m',
            urls: ['https://\u001b[32mgoogle.com\u001b[0m'],
          };

          const sanitized = escapeAnsiCtrlCodes(details);

          if (sanitized.type === 'info') {
            expect(sanitized.title).toBe('\\u001b[34mWeb Search\\u001b[0m');
            expect(sanitized.prompt).toBe(
              '\\u001b[31mSearch for cats\\u001b[0m',
            );
            expect(sanitized.urls?.[0]).toBe(
              'https://\\u001b[32mgoogle.com\\u001b[0m',
            );
          }
        });
      });

      it('should not change the object if no sanitization is needed', () => {
        const details: SerializableConfirmationDetails = {
          type: 'info',
          title: 'Web Search',
          prompt: 'Search for cats',
          urls: ['https://google.com'],
        };

        const sanitized = escapeAnsiCtrlCodes(details);
        expect(sanitized).toBe(details);
      });

      it('should handle nested objects and arrays', () => {
        const details = {
          a: '\u001b[31mred\u001b[0m',
          b: {
            c: '\u001b[32mgreen\u001b[0m',
            d: ['\u001b[33myellow\u001b[0m', { e: '\u001b[34mblue\u001b[0m' }],
          },
          f: 123,
          g: null,
          h: () => '\u001b[35mpurple\u001b[0m',
        };

        const sanitized = escapeAnsiCtrlCodes(details);

        expect(sanitized.a).toBe('\\u001b[31mred\\u001b[0m');
        if (typeof sanitized.b === 'object' && sanitized.b !== null) {
          const b = sanitized.b as { c: string; d: Array<string | object> };
          expect(b.c).toBe('\\u001b[32mgreen\\u001b[0m');
          expect(b.d[0]).toBe('\\u001b[33myellow\\u001b[0m');
          if (typeof b.d[1] === 'object' && b.d[1] !== null) {
            const e = b.d[1] as { e: string };
            expect(e.e).toBe('\\u001b[34mblue\\u001b[0m');
          }
        }
        expect(sanitized.f).toBe(123);
        expect(sanitized.g).toBe(null);
        expect(sanitized.h()).toBe('\u001b[35mpurple\u001b[0m');
      });
    });
  });
});
