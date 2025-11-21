/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatDefaultValue } from '../utils/autogen.js';

describe('formatDefaultValue', () => {
  it('returns "undefined" for undefined', () => {
    expect(formatDefaultValue(undefined)).toBe('undefined');
  });

  it('returns "null" for null', () => {
    expect(formatDefaultValue(null)).toBe('null');
  });

  it('returns string values as-is by default', () => {
    expect(formatDefaultValue('hello')).toBe('hello');
  });

  it('quotes strings when requested', () => {
    expect(formatDefaultValue('hello', { quoteStrings: true })).toBe('"hello"');
  });

  it('returns numbers as strings', () => {
    expect(formatDefaultValue(123)).toBe('123');
  });

  it('returns booleans as strings', () => {
    expect(formatDefaultValue(true)).toBe('true');
  });

  it('pretty prints arrays', () => {
    const input = ['a', 'b'];
    const expected = JSON.stringify(input, null, 2);
    expect(formatDefaultValue(input)).toBe(expected);
    expect(formatDefaultValue(input)).toContain('\n');
  });

  it('returns "[]" for empty arrays', () => {
    expect(formatDefaultValue([])).toBe('[]');
  });

  it('pretty prints objects', () => {
    const input = { foo: 'bar', baz: 123 };
    const expected = JSON.stringify(input, null, 2);
    expect(formatDefaultValue(input)).toBe(expected);
    expect(formatDefaultValue(input)).toContain('\n');
  });

  it('returns "{}" for empty objects', () => {
    expect(formatDefaultValue({})).toBe('{}');
  });
});
