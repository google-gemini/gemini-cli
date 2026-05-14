/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  safeLiteralReplace,
  truncateString,
  safeTemplateReplace,
  stripLineColumnSuffixes,
} from './textUtils.js';

describe('stripLineColumnSuffixes', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should strip line and column numbers from absolute and relative Windows paths on Windows', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    expect(stripLineColumnSuffixes('C:\\foo\\bar.js:10:5')).toBe('C:\\foo\\bar.js');
    expect(stripLineColumnSuffixes('D:\\project\\index.ts:42')).toBe(
      'D:\\project\\index.ts',
    );
    expect(stripLineColumnSuffixes('src\\utils\\file.ts:10:5')).toBe(
      'src\\utils\\file.ts',
    );
    expect(stripLineColumnSuffixes('C:\\path with spaces\\file.txt:1:1')).toBe(
      'C:\\path with spaces\\file.txt',
    );
    expect(stripLineColumnSuffixes('Found at C:\\foo.js:10:5.')).toBe(
      'Found at C:\\foo.js.',
    );
  });

  it('should not strip suffixes from non-absolute Windows paths or URLs', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    expect(stripLineColumnSuffixes('http://localhost:3000')).toBe(
      'http://localhost:3000',
    );
    expect(stripLineColumnSuffixes('ftp://127.0.0.1:21')).toBe(
      'ftp://127.0.0.1:21',
    );
    expect(stripLineColumnSuffixes('some text with :10:5 suffix')).toBe(
      'some text with :10:5 suffix',
    );
  });

  it('should not strip anything on non-Windows platforms', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

    expect(stripLineColumnSuffixes('C:\\foo\\bar.js:10:5')).toBe(
      'C:\\foo\\bar.js:10:5',
    );
    expect(stripLineColumnSuffixes('/home/user/file.ts:10:5')).toBe(
      '/home/user/file.ts:10:5',
    );
  });
});

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
