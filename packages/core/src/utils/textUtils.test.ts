/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { isBinary, safeLiteralReplace } from './textUtils.js';

describe('isBinary', () => {
  it('should return false for an empty buffer', () => {
    const emptyBuffer = Buffer.from([]);
    expect(isBinary(emptyBuffer)).toBe(false);
  });

  it('should return true for a buffer with a null byte', () => {
    const bufferWithNull = Buffer.from([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00]);
    expect(isBinary(bufferWithNull)).toBe(true);
  });

  it('should return false for a buffer without a null byte', () => {
    const bufferWithoutNull = Buffer.from([0x68, 0x65, 0x6c, 0x6c, 0x6f]);
    expect(isBinary(bufferWithoutNull)).toBe(false);
  });

  it('should return true for a buffer of sampleSize with a null byte at the end', () => {
    const sampleSize = 512;
    const buffer = Buffer.alloc(sampleSize);
    buffer[sampleSize - 1] = 0x00;
    expect(isBinary(buffer, sampleSize)).toBe(true);
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
