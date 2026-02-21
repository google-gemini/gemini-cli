/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  safeLiteralReplace,
  truncateString,
  countLines,
  isBlankLine,
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
});

describe('countLines', () => {
  it('returns 0 for an empty string', () => {
    expect(countLines('')).toBe(0);
  });

  it('returns 1 for a string with no newlines', () => {
    expect(countLines('hello world')).toBe(1);
  });

  it('counts Unix line endings correctly', () => {
    expect(countLines('line1\nline2\nline3')).toBe(3);
  });

  it('counts Windows line endings correctly', () => {
    expect(countLines('line1\r\nline2\r\nline3')).toBe(3);
  });

  it('counts a trailing newline as an additional line', () => {
    expect(countLines('line1\nline2\n')).toBe(3);
  });

  it('counts a single newline as two lines', () => {
    expect(countLines('\n')).toBe(2);
  });
});

describe('isBlankLine', () => {
  it('returns true for an empty string', () => {
    expect(isBlankLine('')).toBe(true);
  });

  it('returns true for a string of only spaces', () => {
    expect(isBlankLine('   ')).toBe(true);
  });

  it('returns true for a string of only tabs', () => {
    expect(isBlankLine('\t\t')).toBe(true);
  });

  it('returns true for a mixed whitespace string', () => {
    expect(isBlankLine(' \t  \t ')).toBe(true);
  });

  it('returns false for a string with non-whitespace content', () => {
    expect(isBlankLine('hello')).toBe(false);
  });

  it('returns false for a string with leading/trailing whitespace around content', () => {
    expect(isBlankLine('  hello  ')).toBe(false);
  });
});
