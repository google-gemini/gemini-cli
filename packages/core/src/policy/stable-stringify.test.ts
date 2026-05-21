/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { stableStringify } from './stable-stringify.js';

describe('stableStringify', () => {
  it('should stringify basic primitives', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(true)).toBe('true');
    expect(stableStringify(false)).toBe('false');
    expect(stableStringify(123)).toBe('123');
    expect(stableStringify('hello')).toBe('"hello"');
  });

  it('should sort object keys alphabetically', () => {
    const obj1 = { b: 2, a: 1, c: 3 };
    const obj2 = { c: 3, b: 2, a: 1 };

    // Note: Top-level properties are wrapped in \0
    const expected = '{\0"a":1\0,\0"b":2\0,\0"c":3\0}';
    expect(stableStringify(obj1)).toBe(expected);
    expect(stableStringify(obj2)).toBe(expected);
  });

  it('should handle nested objects (only top-level gets \0)', () => {
    const obj = { b: { d: 4, c: 3 }, a: 1 };
    const expected = '{\0"a":1\0,\0"b":{"c":3,"d":4}\0}';
    expect(stableStringify(obj)).toBe(expected);
  });

  it('should handle arrays', () => {
    const arr = [3, 1, 2];
    // Top-level arrays don't get \0 because they don't have "keys" in the same way objects do in this implementation
    expect(stableStringify(arr)).toBe('[3,1,2]');
  });

  it('should handle nested arrays and objects', () => {
    const obj = {
      b: [{ y: 2, x: 1 }, 3],
      a: 1,
    };
    const expected = '{\0"a":1\0,\0"b":[{"x":1,"y":2},3]\0}';
    expect(stableStringify(obj)).toBe(expected);
  });

  it('should handle circular references by replacing them with "[Circular]"', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = { a: 1 };
    obj.self = obj;
    const expected = '{\0"a":1\0,\0"self":"[Circular]"\0}';
    expect(stableStringify(obj)).toBe(expected);
  });

  it('should handle deep circular references', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = { a: { b: {} } };
    obj.a.b.parent = obj.a;
    obj.root = obj;

    // ancestors: {obj}
    //   "a": stringify({b: ...}, {obj}, false)
    //     ancestors: {obj, obj.a}
    //       "b": stringify({parent: ...}, {obj, obj.a}, false)
    //         ancestors: {obj, obj.a, obj.a.b}
    //           "parent": ancestors.has(obj.a) -> "[Circular]"
    const expected =
      '{\0"a":{"b":{"parent":"[Circular]"}}\0,\0"root":"[Circular]"\0}';
    expect(stableStringify(obj)).toBe(expected);
  });

  it('should correctly handle multiple references to the same non-circular object', () => {
    const shared = { x: 1 };
    const obj = { a: shared, b: shared };
    // This is NOT circular, so it should be stringified twice
    const expected = '{\0"a":{"x":1}\0,\0"b":{"x":1}\0}';
    expect(stableStringify(obj)).toBe(expected);
  });

  it('should respect toJSON methods', () => {
    const obj = {
      a: 1,
      toJSON: () => ({ b: 2 }),
    };
    // stableStringify calls toJSON, then stringifies the result.
    // If it's top-level, it should still have \0 for the resulting object's keys.
    const expected = '{\0"b":2\0}';
    expect(stableStringify(obj)).toBe(expected);
  });

  it('should handle toJSON that returns a primitive', () => {
    const obj = {
      toJSON: () => 'json-val',
    };
    expect(stableStringify(obj)).toBe('"json-val"');
  });

  it('should handle toJSON that throws by treating it as a regular object', () => {
    const obj = {
      a: 1,
      toJSON: () => {
        throw new Error('fail');
      },
    };
    // It should skip toJSON and proceed to stringify the object
    // Wait, if it treats it as a regular object, it will try to stringify 'toJSON' property?
    // But 'toJSON' is a function, so it should be omitted in objects.
    const expected = '{\0"a":1\0}';
    expect(stableStringify(obj)).toBe(expected);
  });

  it('should omit undefined and functions in objects', () => {
    const obj = {
      a: 1,
      b: undefined,
      c: () => {},
      d: 2,
    };
    const expected = '{\0"a":1\0,\0"d":2\0}';
    expect(stableStringify(obj)).toBe(expected);
  });

  it('should convert undefined and functions to null in arrays', () => {
    const arr = [1, undefined, () => {}, 2];
    expect(stableStringify(arr)).toBe('[1,null,null,2]');
  });

  it('should handle Symbols in arrays (should ideally be null like undefined)', () => {
    const arr = [1, Symbol('foo'), 2];
    // If it behaves like JSON.stringify, it should be [1,null,2]
    // Let's see what it actually does.
    expect(stableStringify(arr)).toBe('[1,null,2]');
  });

  it('should handle top-level undefined and functions', () => {
    expect(stableStringify(undefined)).toBe('null');
    expect(stableStringify(() => {})).toBe('null');
  });

  it('should handle empty objects and arrays', () => {
    expect(stableStringify({})).toBe('{}');
    expect(stableStringify([])).toBe('[]');
  });

  it('should handle special characters in keys (they should be escaped by JSON.stringify)', () => {
    const obj = { 'key\0with\0null': 1 };
    // JSON.stringify handles escaping \0 to \u0000
    // So it should be {\0"key\u0000with\u0000null":1\0}
    const expected = '{\0"key\\u0000with\\u0000null":1\0}';
    expect(stableStringify(obj)).toBe(expected);
  });

  it('should handle repeated non-circular objects at different levels', () => {
    const shared = { x: 1 };
    const obj = {
      a: shared,
      b: {
        c: shared,
      },
    };
    const expected = '{\0"a":{"x":1}\0,\0"b":{"c":{"x":1}}\0}';
    expect(stableStringify(obj)).toBe(expected);
  });

  it('should handle Symbols (return "null" consistently with undefined)', () => {
    // JSON.stringify(Symbol('foo')) is undefined, but stableStringify returns 'null' for consistency and type safety
    expect(stableStringify(Symbol('foo'))).toBe('null');
  });

  it('should omit Symbols in objects', () => {
    const obj = { a: 1, b: Symbol('foo') };
    expect(stableStringify(obj)).toBe('{\0"a":1\0}');
  });

  it('should handle BigInt (JSON.stringify throws, so stableStringify will throw)', () => {
    expect(() => stableStringify(BigInt(123))).toThrow();
  });
});
