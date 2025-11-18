/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { stableStringify } from './stable-stringify.js';

describe('stableStringify', () => {
  describe('primitives', () => {
    it('should handle null', () => {
      expect(stableStringify(null)).toBe('null');
    });

    it('should handle undefined as null', () => {
      expect(stableStringify(undefined)).toBe('null');
    });

    it('should handle booleans', () => {
      expect(stableStringify(true)).toBe('true');
      expect(stableStringify(false)).toBe('false');
    });

    it('should handle numbers', () => {
      expect(stableStringify(42)).toBe('42');
      expect(stableStringify(0)).toBe('0');
      expect(stableStringify(-1)).toBe('-1');
      expect(stableStringify(3.14)).toBe('3.14');
    });

    it('should handle strings', () => {
      expect(stableStringify('hello')).toBe('"hello"');
      expect(stableStringify('')).toBe('""');
      expect(stableStringify('with "quotes"')).toBe('"with \\"quotes\\""');
    });

    it('should handle functions as null', () => {
      expect(stableStringify(() => {})).toBe('null');
      expect(
        stableStringify(function namedFunc() {
          return 42;
        }),
      ).toBe('null');
    });
  });

  describe('key ordering - deterministic output', () => {
    it('should sort object keys alphabetically', () => {
      const obj1 = { b: 2, a: 1, c: 3 };
      const obj2 = { c: 3, a: 1, b: 2 };
      const obj3 = { a: 1, b: 2, c: 3 };

      const result = '{"a":1,"b":2,"c":3}';
      expect(stableStringify(obj1)).toBe(result);
      expect(stableStringify(obj2)).toBe(result);
      expect(stableStringify(obj3)).toBe(result);
    });

    it('should handle nested objects with sorted keys', () => {
      const obj = {
        z: { y: 2, x: 1 },
        a: { c: 4, b: 3 },
      };

      expect(stableStringify(obj)).toBe('{"a":{"b":3,"c":4},"z":{"x":1,"y":2}}');
    });

    it('should handle complex nested structures', () => {
      const obj = {
        user: { name: 'Alice', id: 123 },
        settings: { theme: 'dark', lang: 'en' },
        meta: { version: 1 },
      };

      expect(stableStringify(obj)).toBe(
        '{"meta":{"version":1},"settings":{"lang":"en","theme":"dark"},"user":{"id":123,"name":"Alice"}}',
      );
    });
  });

  describe('arrays', () => {
    it('should handle empty arrays', () => {
      expect(stableStringify([])).toBe('[]');
    });

    it('should handle arrays of primitives', () => {
      expect(stableStringify([1, 2, 3])).toBe('[1,2,3]');
      expect(stableStringify(['a', 'b', 'c'])).toBe('["a","b","c"]');
    });

    it('should convert undefined in arrays to null', () => {
      expect(stableStringify([1, undefined, 3])).toBe('[1,null,3]');
      expect(stableStringify([undefined, undefined])).toBe('[null,null]');
    });

    it('should convert functions in arrays to null', () => {
      expect(stableStringify([1, () => {}, 3])).toBe('[1,null,3]');
    });

    it('should handle arrays of objects', () => {
      const arr = [
        { b: 2, a: 1 },
        { d: 4, c: 3 },
      ];
      expect(stableStringify(arr)).toBe('[{"a":1,"b":2},{"c":3,"d":4}]');
    });

    it('should handle nested arrays', () => {
      expect(stableStringify([[1, 2], [3, 4]])).toBe('[[1,2],[3,4]]');
      expect(stableStringify([[[1]]])).toBe('[[[1]]]');
    });
  });

  describe('objects with undefined and function values', () => {
    it('should omit undefined values from objects', () => {
      const obj = { a: 1, b: undefined, c: 3 };
      expect(stableStringify(obj)).toBe('{"a":1,"c":3}');
    });

    it('should omit function values from objects', () => {
      const obj = {
        a: 1,
        b: () => {},
        c: 3,
      };
      expect(stableStringify(obj)).toBe('{"a":1,"c":3}');
    });

    it('should handle objects with only undefined/function values', () => {
      expect(stableStringify({ a: undefined, b: () => {} })).toBe('{}');
    });

    it('should handle mixed cases', () => {
      const obj = {
        valid: 'yes',
        undef: undefined,
        func: () => 'test',
        nullVal: null,
        number: 42,
      };
      expect(stableStringify(obj)).toBe('{"nullVal":null,"number":42,"valid":"yes"}');
    });
  });

  describe('circular references', () => {
    it('should handle simple circular reference', () => {
      const obj: any = { a: 1 };
      obj.self = obj;

      expect(stableStringify(obj)).toBe('{"a":1,"self":"[Circular]"}');
    });

    it('should handle circular reference in nested object', () => {
      const obj: any = { a: 1, nested: {} };
      obj.nested.parent = obj;

      expect(stableStringify(obj)).toBe('{"a":1,"nested":{"parent":"[Circular]"}}');
    });

    it('should handle circular reference in array', () => {
      const obj: any = { items: [] };
      obj.items.push(obj);

      expect(stableStringify(obj)).toBe('{"items":["[Circular]"]}');
    });

    it('should handle multiple circular references', () => {
      const obj: any = { a: 1 };
      obj.ref1 = obj;
      obj.ref2 = obj;

      expect(stableStringify(obj)).toBe('{"a":1,"ref1":"[Circular]","ref2":"[Circular]"}');
    });

    it('should handle deep circular references', () => {
      const obj: any = { level1: { level2: { level3: {} } } };
      obj.level1.level2.level3.root = obj;

      expect(stableStringify(obj)).toBe(
        '{"level1":{"level2":{"level3":{"root":"[Circular]"}}}}',
      );
    });

    it('should allow repeated non-circular references', () => {
      const shared = { value: 42 };
      const obj = {
        ref1: shared,
        ref2: shared,
      };

      // Both references should be serialized fully (not circular)
      expect(stableStringify(obj)).toBe('{"ref1":{"value":42},"ref2":{"value":42}}');
    });

    it('should handle array with circular reference to parent object', () => {
      const obj: any = { data: [1, 2, 3] };
      obj.data.push(obj);

      expect(stableStringify(obj)).toBe('{"data":[1,2,3,"[Circular]"]}');
    });

    it('should handle sibling objects with shared references', () => {
      const shared = { id: 1 };
      const obj = {
        a: { ref: shared },
        b: { ref: shared },
      };

      // Shared objects that aren't in ancestor chain should be serialized fully
      expect(stableStringify(obj)).toBe('{"a":{"ref":{"id":1}},"b":{"ref":{"id":1}}}');
    });
  });

  describe('toJSON method support', () => {
    it('should call toJSON method when present', () => {
      const obj = {
        sensitive: 'secret',
        toJSON: () => ({ safe: 'data' }),
      };

      expect(stableStringify(obj)).toBe('{"safe":"data"}');
    });

    it('should handle toJSON returning primitive', () => {
      const obj = {
        value: 'original',
        toJSON: () => 'replaced',
      };

      expect(stableStringify(obj)).toBe('"replaced"');
    });

    it('should handle toJSON returning null', () => {
      const obj = {
        value: 'original',
        toJSON: () => null,
      };

      expect(stableStringify(obj)).toBe('null');
    });

    it('should handle toJSON returning array', () => {
      const obj = {
        toJSON: () => [1, 2, 3],
      };

      expect(stableStringify(obj)).toBe('[1,2,3]');
    });

    it('should handle nested toJSON calls', () => {
      const inner = {
        value: 'inner',
        toJSON: () => ({ transformed: 'inner' }),
      };
      const outer = {
        nested: inner,
        toJSON: () => ({ nested: inner }),
      };

      expect(stableStringify(outer)).toBe('{"nested":{"transformed":"inner"}}');
    });

    it('should handle toJSON that throws error', () => {
      const obj = {
        value: 'fallback',
        toJSON: () => {
          throw new Error('toJSON failed');
        },
      };

      // Should fall back to regular object serialization
      expect(stableStringify(obj)).toBe('{"value":"fallback"}');
    });

    it('should handle toJSON in array elements', () => {
      const obj1 = { toJSON: () => 'first' };
      const obj2 = { toJSON: () => 'second' };

      expect(stableStringify([obj1, obj2])).toBe('["first","second"]');
    });

    it('should respect Date.toJSON behavior', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');
      expect(stableStringify(date)).toBe('"2024-01-01T00:00:00.000Z"');
    });

    it('should handle toJSON with unsorted keys and sort them', () => {
      const obj = {
        toJSON: () => ({ z: 3, a: 1, m: 2 }),
      };

      expect(stableStringify(obj)).toBe('{"a":1,"m":2,"z":3}');
    });
  });

  describe('complex scenarios', () => {
    it('should handle empty object', () => {
      expect(stableStringify({})).toBe('{}');
    });

    it('should handle deeply nested structures', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
              },
            },
          },
        },
      };

      expect(stableStringify(obj)).toBe(
        '{"level1":{"level2":{"level3":{"level4":{"value":"deep"}}}}}',
      );
    });

    it('should handle mixed arrays and objects', () => {
      const obj = {
        users: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
        ],
        meta: {
          count: 2,
          tags: ['admin', 'user'],
        },
      };

      expect(stableStringify(obj)).toBe(
        '{"meta":{"count":2,"tags":["admin","user"]},"users":[{"age":30,"name":"Alice"},{"age":25,"name":"Bob"}]}',
      );
    });

    it('should handle special characters in strings', () => {
      const obj = {
        text: 'Hello\nWorld\t!',
        quote: 'He said "hello"',
        backslash: 'path\\to\\file',
      };

      expect(stableStringify(obj)).toBe(
        '{"backslash":"path\\\\to\\\\file","quote":"He said \\"hello\\"","text":"Hello\\nWorld\\t!"}',
      );
    });

    it('should handle numbers with special values', () => {
      expect(stableStringify({ inf: Infinity })).toBe('{"inf":null}');
      expect(stableStringify({ ninf: -Infinity })).toBe('{"ninf":null}');
      expect(stableStringify({ nan: NaN })).toBe('{"nan":null}');
    });

    it('should match JSON.stringify for simple cases', () => {
      const testCases = [
        { a: 1, b: 2 },
        [1, 2, 3],
        'string',
        42,
        true,
        null,
      ];

      for (const testCase of testCases) {
        const expected = JSON.stringify(testCase);
        const actual = stableStringify(testCase);
        // For objects, we need to account for key sorting
        if (typeof testCase === 'object' && testCase !== null && !Array.isArray(testCase)) {
          expect(actual).toBe('{"a":1,"b":2}');
        } else {
          expect(actual).toBe(expected);
        }
      }
    });
  });

  describe('security - DoS prevention', () => {
    it('should handle very deep nesting without stack overflow', () => {
      let obj: any = { value: 'deep' };
      for (let i = 0; i < 100; i++) {
        obj = { nested: obj };
      }

      // Should complete without stack overflow
      const result = stableStringify(obj);
      expect(result).toContain('value');
      expect(result).toContain('nested');
    });

    it('should handle large arrays efficiently', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => i);
      const result = stableStringify(largeArray);

      expect(result).toContain('[0,1,2');
      expect(result).toContain('999]');
    });

    it('should handle objects with many keys', () => {
      const obj: Record<string, number> = {};
      for (let i = 0; i < 1000; i++) {
        obj[`key${i}`] = i;
      }

      const result = stableStringify(obj);
      expect(result).toContain('"key0":0');
      expect(result).toContain('"key999":999');
    });

    it('should handle circular reference chains without infinite loop', () => {
      const obj1: any = { name: 'obj1' };
      const obj2: any = { name: 'obj2' };
      const obj3: any = { name: 'obj3' };

      obj1.next = obj2;
      obj2.next = obj3;
      obj3.next = obj1;

      const result = stableStringify(obj1);
      expect(result).toContain('[Circular]');
      expect(result).toContain('obj1');
      expect(result).toContain('obj2');
      expect(result).toContain('obj3');
    });
  });

  describe('determinism - consistency across calls', () => {
    it('should produce identical output for identical inputs', () => {
      const obj = {
        z: [3, 2, 1],
        a: { nested: { value: 42 } },
        m: 'middle',
      };

      const result1 = stableStringify(obj);
      const result2 = stableStringify(obj);
      const result3 = stableStringify(obj);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it('should produce identical output regardless of property insertion order', () => {
      const obj1: any = {};
      obj1.z = 1;
      obj1.a = 2;
      obj1.m = 3;

      const obj2: any = {};
      obj2.a = 2;
      obj2.m = 3;
      obj2.z = 1;

      const obj3: any = {};
      obj3.m = 3;
      obj3.z = 1;
      obj3.a = 2;

      const result1 = stableStringify(obj1);
      const result2 = stableStringify(obj2);
      const result3 = stableStringify(obj3);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe('{"a":2,"m":3,"z":1}');
    });
  });

  describe('edge cases', () => {
    it('should handle objects with numeric keys', () => {
      const obj = { 3: 'three', 1: 'one', 2: 'two' };
      // Numeric keys are sorted as strings
      expect(stableStringify(obj)).toBe('{"1":"one","2":"two","3":"three"}');
    });

    it('should handle objects with symbol keys (ignored)', () => {
      const sym = Symbol('test');
      const obj = { [sym]: 'symbol value', regular: 'regular value' };
      // Symbols are not enumerable in Object.keys, so ignored
      expect(stableStringify(obj)).toBe('{"regular":"regular value"}');
    });

    it('should handle sparse arrays', () => {
      const arr = [1, , 3]; // sparse array with empty slot
      // Sparse arrays map over actual indices, empty slots result in empty positions
      expect(stableStringify(arr)).toBe('[1,,3]');
    });

    it('should handle arrays with object properties', () => {
      const arr: any = [1, 2, 3];
      arr.customProp = 'value';
      // Only array indices are serialized, not custom properties
      expect(stableStringify(arr)).toBe('[1,2,3]');
    });

    it('should handle Map and Set objects', () => {
      const map = new Map([['key', 'value']]);
      const set = new Set([1, 2, 3]);

      // Maps and Sets are serialized as empty objects by default
      expect(stableStringify(map)).toBe('{}');
      expect(stableStringify(set)).toBe('{}');
    });

    it('should handle Buffer objects', () => {
      if (typeof Buffer !== 'undefined') {
        const buffer = Buffer.from('hello');
        const result = stableStringify(buffer);
        // Buffer has toJSON method that returns array representation
        expect(result).toContain('[');
      }
    });

    it('should handle class instances', () => {
      class Person {
        constructor(
          public name: string,
          public age: number,
        ) {}
      }

      const person = new Person('Alice', 30);
      expect(stableStringify(person)).toBe('{"age":30,"name":"Alice"}');
    });

    it('should handle class instances with methods (methods omitted)', () => {
      class Calculator {
        value: number;
        constructor(val: number) {
          this.value = val;
        }
        add(x: number) {
          return this.value + x;
        }
      }

      const calc = new Calculator(10);
      expect(stableStringify(calc)).toBe('{"value":10}');
    });
  });
});
