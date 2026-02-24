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
