/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  safeLiteralReplace,
  truncateString,
  safeTemplateReplace,
  isBinary,
  stripAnsiFromBuffer,
} from './textUtils.js';

describe('safeLiteralReplace', () => {
  it('returns original string when oldString empty or not found', () => {
    expect(safeLiteralReplace('abc', '', 'X')).toBe('abc');
    expect(safeLiteralReplace('abc', 'z', 'X')).toBe('abc');
  });

  it('fast path when newString has no $', () => {
    expect(safeLiteralReplace('abc', 'b', 'X')).toBe('aXc');
  });

  it('treats $ literally', () => {
    expect(safeLiteralReplace('foo', 'foo', "bar$'baz")).toBe("bar$'baz");
  });

  it("does not interpret replacement patterns like $&, $', $` and $1", () => {
    expect(safeLiteralReplace('hello', 'hello', '$&-replacement')).toBe(
      '$&-replacement',
    );
    expect(safeLiteralReplace('mid', 'mid', 'new$`content')).toBe(
      'new$`content',
    );
    expect(safeLiteralReplace('test', 'test', '$1$2value')).toBe('$1$2value');
  });

  it('preserves end-of-line $ in regex-like text', () => {
    const current = "| select('match', '^[sv]d[a-z]$')";
    const oldStr = "'^[sv]d[a-z]$'";
    const newStr = "'^[sv]d[a-z]$' # updated";
    const expected = "| select('match', '^[sv]d[a-z]$' # updated)";
    expect(safeLiteralReplace(current, oldStr, newStr)).toBe(expected);
  });

  it('handles multiple $ characters', () => {
    expect(safeLiteralReplace('x', 'x', '$$$')).toBe('$$$');
  });

  it('preserves pre-escaped $$ literally', () => {
    expect(safeLiteralReplace('x', 'x', '$$value')).toBe('$$value');
  });

  it('handles complex malicious patterns from PR #7871', () => {
    const original = 'The price is PRICE.';
    const result = safeLiteralReplace(
      original,
      'PRICE',
      "$& Wow, that's a lot! $'",
    );
    expect(result).toBe("The price is $& Wow, that's a lot! $'.");
  });

  it('handles multiple replacements correctly', () => {
    const text = 'Replace FOO and FOO again';
    const result = safeLiteralReplace(text, 'FOO', '$100');
    expect(result).toBe('Replace $100 and $100 again');
  });

  it('preserves $ at different positions', () => {
    expect(safeLiteralReplace('test', 'test', '$')).toBe('$');
    expect(safeLiteralReplace('test', 'test', 'prefix$')).toBe('prefix$');
    expect(safeLiteralReplace('test', 'test', '$suffix')).toBe('$suffix');
  });

  it('handles edge case with $$$$', () => {
    expect(safeLiteralReplace('x', 'x', '$$$$')).toBe('$$$$');
  });

  it('handles newString with only dollar signs', () => {
    expect(safeLiteralReplace('abc', 'b', '$$')).toBe('a$$c');
  });
});

describe('truncateString', () => {
  it('should not truncate string shorter than maxLength', () => {
    expect(truncateString('abc', 5)).toBe('abc');
  });

  it('should not truncate string equal to maxLength', () => {
    expect(truncateString('abcde', 5)).toBe('abcde');
  });

  it('should truncate string longer than maxLength and append default suffix', () => {
    expect(truncateString('abcdef', 5)).toBe('abcde...[TRUNCATED]');
  });

  it('should truncate string longer than maxLength and append custom suffix', () => {
    expect(truncateString('abcdef', 5, '...')).toBe('abcde...');
  });

  it('should handle empty string', () => {
    expect(truncateString('', 5)).toBe('');
  });

  it('should not slice surrogate pairs', () => {
    const emoji = '😭'; // \uD83D\uDE2D, length 2
    const str = 'a' + emoji; // length 3

    // We expect 'a' (len 1). Adding the emoji (len 2) would make it 3, exceeding maxLength 2.
    expect(truncateString(str, 2, '')).toBe('a');
    expect(truncateString(str, 1, '')).toBe('a');
    expect(truncateString(emoji, 1, '')).toBe('');
    expect(truncateString(emoji, 2, '')).toBe(emoji);
  });

  it('should handle pre-existing dangling high surrogates at the cut point', () => {
    // \uD83D is a high surrogate without a following low surrogate
    const str = 'a\uD83Db';
    // 'a' (1) + '\uD83D' (1) = 2.
    // BUT our function should strip the dangling surrogate for safety.
    expect(truncateString(str, 2, '')).toBe('a');
  });

  it('should handle multi-code-point grapheme clusters like combining marks', () => {
    // FORCE Decomposed form (NFD) to ensure 'e' + 'accent' are separate code units
    // This ensures the test behaves the same on Linux and Mac.
    const combinedChar = 'e\u0301'.normalize('NFD');

    // In NFD, combinedChar.length is 2.
    const str = 'a' + combinedChar; // 'a' + 'e' + '\u0301' (length 3)

    // Truncating at 2: 'a' (1) + 'e\u0301' (2) = 3. Too long, should stay at 'a'.
    expect(truncateString(str, 2, '')).toBe('a');
    expect(truncateString(str, 1, '')).toBe('a');

    // Truncating combinedChar (len 2) at maxLength 1: too long, should be empty.
    expect(truncateString(combinedChar, 1, '')).toBe('');

    // Truncating combinedChar (len 2) at maxLength 2: fits perfectly.
    expect(truncateString(combinedChar, 2, '')).toBe(combinedChar);
  });
});

describe('safeTemplateReplace', () => {
  it('replaces all occurrences of known keys', () => {
    const tmpl = 'Hello {{name}}, welcome to {{place}}. {{name}} is happy.';
    const replacements = { name: 'Alice', place: 'Wonderland' };
    expect(safeTemplateReplace(tmpl, replacements)).toBe(
      'Hello Alice, welcome to Wonderland. Alice is happy.',
    );
  });

  it('ignores keys not present in replacements', () => {
    const tmpl = 'Hello {{name}}, welcome to {{unknown}}.';
    const replacements = { name: 'Bob' };
    expect(safeTemplateReplace(tmpl, replacements)).toBe(
      'Hello Bob, welcome to {{unknown}}.',
    );
  });

  it('ignores extra keys in replacements', () => {
    const tmpl = 'Hello {{name}}';
    const replacements = { name: 'Charlie', age: '30' };
    expect(safeTemplateReplace(tmpl, replacements)).toBe('Hello Charlie');
  });

  it('handles empty template', () => {
    expect(safeTemplateReplace('', { key: 'val' })).toBe('');
  });

  it('handles template with no placeholders', () => {
    expect(safeTemplateReplace('No keys here', { key: 'val' })).toBe(
      'No keys here',
    );
  });

  it('prevents double interpolation (security check)', () => {
    const tmpl = 'User said: {{userInput}}';
    const replacements = {
      userInput: '{{secret}}',
      secret: 'super_secret_value',
    };
    expect(safeTemplateReplace(tmpl, replacements)).toBe(
      'User said: {{secret}}',
    );
  });

  it('handles values with $ signs correctly (no regex group substitution)', () => {
    const tmpl = 'Price: {{price}}';
    const replacements = { price: '$100' };
    expect(safeTemplateReplace(tmpl, replacements)).toBe('Price: $100');
  });

  it('treats special replacement patterns (e.g. "$&") as literal strings', () => {
    const tmpl = 'Value: {{val}}';
    const replacements = { val: '$&' };
    expect(safeTemplateReplace(tmpl, replacements)).toBe('Value: $&');
  });
});

describe('stripAnsiFromBuffer', () => {
  it('returns the buffer unchanged when no escape sequences are present', () => {
    const input = Buffer.from('hello world');
    expect(stripAnsiFromBuffer(input).toString()).toBe('hello world');
  });

  it('strips CSI sequences (ESC [ ... final)', () => {
    // ESC[31m = red foreground, ESC[0m = reset
    const input = Buffer.from('\x1b[31mhello\x1b[0m');
    expect(stripAnsiFromBuffer(input).toString()).toBe('hello');
  });

  it('strips OSC sequences terminated by BEL', () => {
    // OSC title set: ESC ] 0 ; title BEL
    const input = Buffer.from('\x1b]0;My Title\x07some text');
    expect(stripAnsiFromBuffer(input).toString()).toBe('some text');
  });

  it('strips OSC sequences terminated by ST (ESC \\)', () => {
    const input = Buffer.from('\x1b]0;My Title\x1b\\some text');
    expect(stripAnsiFromBuffer(input).toString()).toBe('some text');
  });

  it('strips simple two-byte escape sequences', () => {
    // ESC D = Index (scroll down)
    const input = Buffer.from('\x1bDhello');
    expect(stripAnsiFromBuffer(input).toString()).toBe('hello');
  });

  it('handles multiple mixed escape sequences', () => {
    const input = Buffer.from(
      '\x1b[31m\x1b]0;title\x07hello\x1b[0m world\x1bD',
    );
    expect(stripAnsiFromBuffer(input).toString()).toBe('hello world');
  });

  it('returns empty buffer when input is only escape sequences', () => {
    const input = Buffer.from('\x1b[31m\x1b[0m');
    expect(stripAnsiFromBuffer(input).length).toBe(0);
  });
});

describe('isBinary', () => {
  describe('default mode (strict, for files/pipes)', () => {
    it('returns false for null/undefined/empty input', () => {
      expect(isBinary(null)).toBe(false);
      expect(isBinary(undefined)).toBe(false);
      expect(isBinary(Buffer.alloc(0))).toBe(false);
    });

    it('returns false for plain ASCII text', () => {
      expect(isBinary(Buffer.from('hello world\n'))).toBe(false);
    });

    it('returns true when a single null byte is present', () => {
      expect(isBinary(Buffer.from('hello\x00world'))).toBe(true);
    });

    it('returns true for binary data', () => {
      const buf = Buffer.alloc(100, 0);
      expect(isBinary(buf)).toBe(true);
    });

    it('only checks the first sampleSize bytes', () => {
      const buf = Buffer.alloc(600, 0x41); // 'A' x 600
      buf[550] = 0; // null byte outside default 512 sample
      expect(isBinary(buf)).toBe(false);
    });

    it('detects null byte within custom sampleSize', () => {
      const buf = Buffer.alloc(600, 0x41);
      buf[550] = 0;
      expect(isBinary(buf, 600)).toBe(true);
    });
  });

  describe('PTY mode (isPtyOutput = true)', () => {
    it('returns false for PTY output that is pure ANSI escape sequences', () => {
      const buf = Buffer.from('\x1b[31m\x1b[0m');
      expect(isBinary(buf, 512, true)).toBe(false);
    });

    it('returns false for text with ANSI sequences containing embedded null bytes', () => {
      // Simulate Windows PTY: OSC title set with null bytes, followed by text
      const osc = Buffer.from('\x1b]0;title\x00\x07');
      const text = Buffer.from('hello world');
      const buf = Buffer.concat([osc, text]);
      expect(isBinary(buf, 512, true)).toBe(false);
    });

    it('returns false for a single stray null byte among text', () => {
      const buf = Buffer.from('hello\x00world, this is a long text output');
      expect(isBinary(buf, 512, true)).toBe(false);
    });

    it('returns true for actual binary data through PTY (>10% nulls after strip)', () => {
      // 90 null bytes + 10 text bytes → 90% nulls = binary
      const nulls = Buffer.alloc(90, 0);
      const text = Buffer.from('abcdefghij');
      const buf = Buffer.concat([nulls, text]);
      expect(isBinary(buf, 512, true)).toBe(true);
    });

    it('returns false for realistic Windows PTY output with ANSI reset + text', () => {
      // Simulates: color set, OSC title with a stray null, reset, then real output
      const buf = Buffer.from(
        '\x1b[?25l\x1b]0;\x00Window Title\x07\x1b[0mPS C:\\Users> echo hello\r\nhello\r\n',
      );
      expect(isBinary(buf, 512, true)).toBe(false);
    });

    it('returns false when the buffer is empty after stripping ANSI', () => {
      const buf = Buffer.from('\x1b[31m\x1b[42m\x1b[0m');
      expect(isBinary(buf, 512, true)).toBe(false);
    });
  });
});
