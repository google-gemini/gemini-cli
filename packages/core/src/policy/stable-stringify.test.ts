/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it } from 'vitest';
import { stableStringify } from './stable-stringify.js';

describe('policy/stableStringify', () => {
  describe('primitives', () => {
    it('should stringify strings', () => {
      expect(stableStringify('hello')).toBe('"hello"');
    });

    it('should stringify numbers', () => {
      expect(stableStringify(42)).toBe('42');
      expect(stableStringify(3.14)).toBe('3.14');
      expect(stableStringify(-0)).toBe('0');
    });

    it('should stringify booleans', () => {
      expect(stableStringify(true)).toBe('true');
      expect(stableStringify(false)).toBe('false');
    });

    it('should stringify null', () => {
      expect(stableStringify(null)).toBe('null');
    });

    it('should stringify undefined as null', () => {
      expect(stableStringify(undefined)).toBe('null');
    });

    it('should stringify functions as null', () => {
      expect(stableStringify(() => {})).toBe('null');
    });
  });

  describe('sorted keys', () => {
    it('should sort object keys alphabetically', () => {
      expect(stableStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    });

    it('should produce identical output regardless of insertion order', () => {
      const obj1 = { z: 3, a: 1, m: 2 };
      const obj2 = { a: 1, m: 2, z: 3 };
      const obj3 = { m: 2, z: 3, a: 1 };
      expect(stableStringify(obj1)).toBe(stableStringify(obj2));
      expect(stableStringify(obj2)).toBe(stableStringify(obj3));
    });

    it('should sort nested object keys', () => {
      const obj = { b: { d: 4, c: 3 }, a: 1 };
      expect(stableStringify(obj)).toBe('{"a":1,"b":{"c":3,"d":4}}');
    });
  });

  describe('arrays', () => {
    it('should stringify arrays preserving order', () => {
      expect(stableStringify([1, 2, 3])).toBe('[1,2,3]');
    });

    it('should convert undefined in arrays to null', () => {
      expect(stableStringify([1, undefined, 3])).toBe('[1,null,3]');
    });

    it('should convert functions in arrays to null', () => {
      expect(stableStringify([1, () => {}, 3])).toBe('[1,null,3]');
    });

    it('should handle nested arrays', () => {
      expect(stableStringify([[1, 2], [3]])).toBe('[[1,2],[3]]');
    });

    it('should handle empty arrays', () => {
      expect(stableStringify([])).toBe('[]');
    });
  });

  describe('objects', () => {
    it('should handle empty objects', () => {
      expect(stableStringify({})).toBe('{}');
    });

    it('should omit undefined values from objects', () => {
      expect(stableStringify({ a: 1, b: undefined, c: 3 })).toBe(
        '{"a":1,"c":3}',
      );
    });

    it('should omit function values from objects', () => {
      expect(stableStringify({ a: 1, fn: () => {}, c: 3 })).toBe(
        '{"a":1,"c":3}',
      );
    });

    it('should handle mixed nested structures', () => {
      const obj = { arr: [1, { b: 2, a: 1 }], key: 'value' };
      expect(stableStringify(obj)).toBe(
        '{"arr":[1,{"a":1,"b":2}],"key":"value"}',
      );
    });
  });

  describe('circular references', () => {
    it('should handle self-referencing objects', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj;
      expect(stableStringify(obj)).toBe('{"a":1,"self":"[Circular]"}');
    });

    it('should handle indirect circular references', () => {
      const a: Record<string, unknown> = {};
      const b: Record<string, unknown> = {};
      a.b = b;
      b.a = a;
      expect(stableStringify(a)).toBe('{"b":{"a":"[Circular]"}}');
    });

    it('should allow repeated non-circular references', () => {
      const shared = { x: 1 };
      const obj = { a: shared, b: shared };
      expect(stableStringify(obj)).toBe('{"a":{"x":1},"b":{"x":1}}');
    });
  });

  describe('toJSON support', () => {
    it('should call toJSON when present', () => {
      const obj = {
        sensitive: 'secret',
        toJSON: () => ({ safe: 'data' }),
      };
      expect(stableStringify(obj)).toBe('{"safe":"data"}');
    });

    it('should handle toJSON returning null', () => {
      const obj = { toJSON: () => null };
      expect(stableStringify(obj)).toBe('null');
    });

    it('should handle toJSON returning a primitive', () => {
      const obj = { toJSON: () => 42 };
      expect(stableStringify(obj)).toBe('42');
    });

    it('should fall back to regular serialization if toJSON throws', () => {
      const obj = {
        a: 1,
        toJSON: () => {
          throw new Error('broken');
        },
      };
      expect(stableStringify(obj)).toBe('{"a":1}');
    });
  });

  describe('special characters', () => {
    it('should handle special characters in keys', () => {
      expect(stableStringify({ 'key with spaces': 1 })).toBe(
        '{"key with spaces":1}',
      );
    });

    it('should handle special characters in string values', () => {
      expect(stableStringify({ a: 'line\nnewline' })).toBe(
        '{"a":"line\\nnewline"}',
      );
    });

    it('should handle unicode in keys and values', () => {
      expect(stableStringify({ '\u00e9': '\u00e9' })).toBe(
        '{"\u00e9":"\u00e9"}',
      );
    });
  });
});
