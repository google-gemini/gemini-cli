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

  it('handles toJSON() method returning primitives or undefined', () => {
    expect(stableStringify({ toJSON: () => 'stringified' })).toBe(
      '"stringified"',
    );
    expect(stableStringify({ toJSON: () => 123 })).toBe('123');
    expect(stableStringify({ toJSON: () => null })).toBe('null');
    // toJSON returns undefined -> not caught by the null check -> recursed into
    // stringify where undefined becomes 'null'
    expect(stableStringify({ toJSON: () => undefined })).toBe('null');
  });

  it('handles circular references introduced by toJSON()', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = { a: 1 };
    obj.b = { toJSON: () => obj };
    expect(stableStringify(obj)).toBe('{\0"a":1\0,\0"b":"[Circular]"\0}');
  });

  it('handles repeated non-circular object references correctly', () => {
    const shared = { x: 1 };
    const obj = { a: shared, b: shared };
    expect(stableStringify(obj)).toBe('{\0"a":{"x":1}\0,\0"b":{"x":1}\0}');
  });

  it('escapes null bytes within string values', () => {
    const obj = { key: 'value\0with\0null' };
    // The literal \0 should be escaped to \\u0000 by JSON.stringify, which is what our function uses internally for strings.
    expect(stableStringify(obj)).toBe(
      '{\0"key":"value\\u0000with\\u0000null"\0}',
    );
  });

  it('sorts keys at all nesting levels', () => {
    const obj = { z: { y: { b: 2, a: 1 }, x: 3 }, m: 4 };
    expect(stableStringify(obj)).toBe(
      '{\0"m":4\0,\0"z":{"x":3,"y":{"a":1,"b":2}}\0}',
    );
  });

  it('handles undefined at top-level', () => {
    expect(stableStringify(undefined)).toBe('null');
  });

  it('handles function at top-level', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(stableStringify((() => {}) as any)).toBe('null');
  });

  it('sorts keys within objects nested inside arrays', () => {
    expect(stableStringify([{ b: 2, a: 1 }])).toBe('[{"a":1,"b":2}]');
  });
});
