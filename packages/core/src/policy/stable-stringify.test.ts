/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { stableStringify } from './stable-stringify.js';

describe('stableStringify', () => {
  it('sorts keys at the top-level with null-byte struct boundaries', () => {
    // Top level uses null-byte boundaries
    expect(stableStringify({ b: 2, a: 1 })).toBe('{\0"a":1\0,\0"b":2\0}');
  });

  it('sorts keys in nested objects without null-byte boundaries', () => {
    // Nested objects don't use null boundaries
    expect(stableStringify({ top: { z: 2, a: 1 } })).toBe(
      '{\0"top":{"a":1,"z":2}\0}',
    );
  });

  it('handles circular references by replacing them with [Circular]', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = { a: 1 };
    obj.self = obj;
    expect(stableStringify(obj)).toBe('{\0"a":1\0,\0"self":"[Circular]"\0}');
  });

  it('omits undefined values in objects and converts them to null in arrays', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{\0"a":1\0}');
    expect(stableStringify([1, undefined, 3])).toBe('[1,null,3]');
  });

  it('omits function values in objects and converts them to null in arrays', () => {
    expect(stableStringify({ a: 1, b: () => {} })).toBe('{\0"a":1\0}');
    expect(stableStringify([1, () => {}, 3])).toBe('[1,null,3]');
  });

  it('respects toJSON() method', () => {
    const obj = {
      toJSON: () => ({ safe: 'data' }),
    };
    expect(stableStringify(obj)).toBe('{\0"safe":"data"\0}');
  });

  it('gracefully handles toJSON() methods that throw an error', () => {
    const obj = {
      a: 1,
      toJSON: () => {
        throw new Error('Test Error');
      },
    };
    // It should fall back to standard matching. The toJSON function itself will be omitted.
    expect(stableStringify(obj)).toBe('{\0"a":1\0}');
  });

  it('handles primitive values correctly at top-level', () => {
    // Top-level primitives don't get bracketed with null bytes, they just get stringified
    expect(stableStringify('string')).toBe('"string"');
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify(true)).toBe('true');
    expect(stableStringify(null)).toBe('null');
  });

  it('handles empty objects and arrays correctly', () => {
    expect(stableStringify({})).toBe('{}');
    expect(stableStringify([])).toBe('[]');
  });
});
