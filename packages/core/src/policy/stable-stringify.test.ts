/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { stableStringify } from './stable-stringify.js';

describe('stableStringify', () => {
  it('should stringify primitive values', () => {
    expect(stableStringify('test')).toBe('"test"');
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify(true)).toBe('true');
    expect(stableStringify(null)).toBe('null');
  });

  it('should sort object keys deterministically', () => {
    expect(
      stableStringify({
        b: 2,
        a: 1,
        nested: {
          d: 4,
          c: 3,
        },
      }),
    ).toBe('{"a":1,"b":2,"nested":{"c":3,"d":4}}');
  });

  it('should handle arrays using JSON.stringify-compatible null conversions', () => {
    expect(
      stableStringify([
        1,
        undefined,
        () => 'ignored',
        {
          b: 2,
          a: 1,
        },
        null,
      ]),
    ).toBe('[1,null,null,{"a":1,"b":2},null]');
  });

  it('should replace circular references with [Circular]', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;

    expect(stableStringify(circular)).toBe('{"a":1,"self":"[Circular]"}');
  });

  it('should serialize repeated non-circular references normally', () => {
    const shared = { value: 1 };

    expect(
      stableStringify({
        first: shared,
        second: shared,
      }),
    ).toBe('{"first":{"value":1},"second":{"value":1}}');
  });

  it('should respect toJSON results', () => {
    const withToJson = {
      hidden: 'secret',
      toJSON: () => ({
        b: 2,
        a: 1,
      }),
    };

    expect(stableStringify(withToJson)).toBe('{"a":1,"b":2}');
  });

  it('should fall back to regular object serialization when toJSON throws', () => {
    const withThrowingToJson = {
      z: 1,
      a: 2,
      toJSON: () => {
        throw new Error('boom');
      },
    };

    expect(stableStringify(withThrowingToJson)).toBe('{"a":2,"z":1}');
  });
});
