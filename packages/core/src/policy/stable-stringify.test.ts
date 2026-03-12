/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { stableStringify } from './stable-stringify.js';

describe('stableStringify', () => {
  describe('primitives', () => {
    it('stringifies numbers', () => {
      expect(stableStringify(42)).toBe('42');
      expect(stableStringify(3.14)).toBe('3.14');
      expect(stableStringify(-1)).toBe('-1');
    });

    it('stringifies strings', () => {
      expect(stableStringify('hello')).toBe('"hello"');
      expect(stableStringify('')).toBe('""');
    });

    it('stringifies booleans', () => {
      expect(stableStringify(true)).toBe('true');
      expect(stableStringify(false)).toBe('false');
    });

    it('stringifies null as null', () => {
      expect(stableStringify(null)).toBe('null');
    });

    it('stringifies undefined as null', () => {
      expect(stableStringify(undefined)).toBe('null');
    });

    it('stringifies functions as null', () => {
      expect(stableStringify(() => {})).toBe('null');
    });
  });

  describe('sorted keys', () => {
    it('sorts object keys alphabetically', () => {
      expect(stableStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    });

    it('produces the same output regardless of property insertion order', () => {
      const obj1 = { b: 2, a: 1, c: 3 };
      const obj2 = { c: 3, a: 1, b: 2 };
      expect(stableStringify(obj1)).toBe(stableStringify(obj2));
    });

    it('sorts nested object keys', () => {
      expect(stableStringify({ z: { b: 2, a: 1 }, a: 0 })).toBe(
        '{"a":0,"z":{"a":1,"b":2}}',
      );
    });
  });

  describe('arrays', () => {
    it('stringifies arrays preserving order', () => {
      expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
    });

    it('converts undefined in arrays to null', () => {
      expect(stableStringify([1, undefined, 3])).toBe('[1,null,3]');
    });

    it('converts functions in arrays to null', () => {
      expect(stableStringify([1, () => {}, 3])).toBe('[1,null,3]');
    });

    it('handles nested arrays', () => {
      expect(
        stableStringify([
          [1, 2],
          [3, 4],
        ]),
      ).toBe('[[1,2],[3,4]]');
    });

    it('handles arrays of objects with sorted keys', () => {
      expect(stableStringify([{ b: 2, a: 1 }])).toBe('[{"a":1,"b":2}]');
    });
  });

  describe('objects', () => {
    it('omits undefined values from objects', () => {
      expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
    });

    it('omits function values from objects', () => {
      expect(stableStringify({ a: 1, b: () => {} })).toBe('{"a":1}');
    });

    it('handles empty objects', () => {
      expect(stableStringify({})).toBe('{}');
    });

    it('handles nested objects', () => {
      expect(stableStringify({ a: { c: 3, b: 2 } })).toBe(
        '{"a":{"b":2,"c":3}}',
      );
    });
  });

  describe('circular references', () => {
    it('handles direct circular references', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj['self'] = obj;
      expect(stableStringify(obj)).toBe('{"a":1,"self":"[Circular]"}');
    });

    it('handles indirect circular references', () => {
      const obj: Record<string, unknown> = { a: {} };
      (obj['a'] as Record<string, unknown>)['parent'] = obj;
      expect(stableStringify(obj)).toBe('{"a":{"parent":"[Circular]"}}');
    });

    it('does not mark repeated non-circular references as circular', () => {
      const shared = { x: 1 };
      const obj = { a: shared, b: shared };
      // shared appears twice but is not circular
      expect(stableStringify(obj)).toBe('{"a":{"x":1},"b":{"x":1}}');
    });
  });

  describe('toJSON support', () => {
    it('respects toJSON method', () => {
      const obj = {
        sensitive: 'secret',
        toJSON: () => ({ safe: 'data' }),
      };
      expect(stableStringify(obj)).toBe('{"safe":"data"}');
    });

    it('handles toJSON that returns null', () => {
      const obj = { toJSON: () => null };
      expect(stableStringify(obj)).toBe('null');
    });

    it('handles circular reference from toJSON method', () => {
      const obj: { a: number; toJSON?: () => unknown } = { a: 1 };
      obj.toJSON = () => obj;
      expect(stableStringify(obj)).toBe('"[Circular]"');
    });

    it('handles toJSON that throws', () => {
      const obj = {
        a: 1,
        toJSON: () => {
          throw new Error('toJSON error');
        },
      };
      // Falls back to regular object serialization
      expect(stableStringify(obj)).toBe('{"a":1}');
    });
  });
});
