/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { deepMergeObjects } from './deepMerge.js';

describe('deepMergeObjects', () => {
  it('should return an empty object when called with no arguments', () => {
    expect(deepMergeObjects()).toEqual({});
  });

  it('should return a copy of a single object', () => {
    const source = { a: 1, b: 'two' };
    const result = deepMergeObjects(source);
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
  });

  it('should skip undefined sources', () => {
    const source = { a: 1 };
    expect(deepMergeObjects(undefined, source, undefined)).toEqual({ a: 1 });
  });

  it('should merge flat objects with later sources winning', () => {
    const defaults = { a: 1, b: 2 };
    const user = { b: 99, c: 3 };
    expect(deepMergeObjects(defaults, user)).toEqual({ a: 1, b: 99, c: 3 });
  });

  it('should deep-merge nested objects', () => {
    const defaults = {
      outer: { innerA: 1, innerB: 2 },
    };
    const user = {
      outer: { innerB: 99, innerC: 3 },
    };
    expect(deepMergeObjects(defaults, user)).toEqual({
      outer: { innerA: 1, innerB: 99, innerC: 3 },
    });
  });

  it('should replace arrays wholesale instead of merging them', () => {
    const defaults = { items: [1, 2, 3] };
    const user = { items: [42] };
    expect(deepMergeObjects(defaults, user)).toEqual({ items: [42] });
  });

  it('should handle deeply nested structures', () => {
    const defaults = {
      level1: {
        level2: {
          level3: { a: 1, b: 2 },
        },
      },
    };
    const user = {
      level1: {
        level2: {
          level3: { b: 99 },
        },
      },
    };
    expect(deepMergeObjects(defaults, user)).toEqual({
      level1: {
        level2: {
          level3: { a: 1, b: 99 },
        },
      },
    });
  });

  it('should merge more than two objects', () => {
    const a = { x: 1, y: 2 };
    const b = { y: 3, z: 4 };
    const c = { z: 5, w: 6 };
    expect(deepMergeObjects(a, b, c)).toEqual({ x: 1, y: 3, z: 5, w: 6 });
  });

  it('should not mutate input objects', () => {
    const defaults = { nested: { a: 1 } };
    const user = { nested: { b: 2 } };
    deepMergeObjects(defaults, user);
    expect(defaults).toEqual({ nested: { a: 1 } });
    expect(user).toEqual({ nested: { b: 2 } });
  });

  it('should handle an object value overriding a primitive', () => {
    const defaults = { key: 'string' };
    const user = { key: { nested: true } };
    expect(
      deepMergeObjects(
        defaults as Record<string, unknown>,
        user as Record<string, unknown>,
      ),
    ).toEqual({
      key: { nested: true },
    });
  });

  it('should handle a primitive overriding an object value', () => {
    const defaults = { key: { nested: true } };
    const user = { key: 'string' };
    expect(
      deepMergeObjects(
        defaults as Record<string, unknown>,
        user as Record<string, unknown>,
      ),
    ).toEqual({
      key: 'string',
    });
  });
});
