/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { customDeepMerge } from './deepMerge.js';
import { MergeStrategy } from '../config/settingsSchema.js';

describe('customDeepMerge', () => {
  it('should merge simple objects', () => {
    const target = { a: 1, b: 2 };
    const source = { b: 3, c: 4 };
    const getMergeStrategy = () => undefined;
    const result = customDeepMerge(getMergeStrategy, target, source);
    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('should merge nested objects', () => {
    const target = { a: { x: 1 }, b: 2 };
    const source = { a: { y: 2 }, c: 3 };
    const getMergeStrategy = () => undefined;
    const result = customDeepMerge(getMergeStrategy, target, source);
    expect(result).toEqual({ a: { x: 1, y: 2 }, b: 2, c: 3 });
  });

  it('should replace arrays by default', () => {
    const target = { a: [1, 2] };
    const source = { a: [3, 4] };
    const getMergeStrategy = () => undefined;
    const result = customDeepMerge(getMergeStrategy, target, source);
    expect(result).toEqual({ a: [3, 4] });
  });

  it('should concatenate arrays with CONCAT strategy', () => {
    const target = { a: [1, 2] };
    const source = { a: [3, 4] };
    const getMergeStrategy = (path: string[]) =>
      path.join('.') === 'a' ? MergeStrategy.CONCAT : undefined;
    const result = customDeepMerge(getMergeStrategy, target, source);
    expect(result).toEqual({ a: [1, 2, 3, 4] });
  });

  it('should union arrays with UNION strategy', () => {
    const target = { a: [1, 2, 3] };
    const source = { a: [3, 4, 5] };
    const getMergeStrategy = (path: string[]) =>
      path.join('.') === 'a' ? MergeStrategy.UNION : undefined;
    const result = customDeepMerge(getMergeStrategy, target, source);
    expect(result).toEqual({ a: [1, 2, 3, 4, 5] });
  });

  it('should shallow merge objects with SHALLOW_MERGE strategy', () => {
    const target = { a: { x: 1, y: 1 } };
    const source = { a: { y: 2, z: 2 } };
    const getMergeStrategy = (path: string[]) =>
      path.join('.') === 'a' ? MergeStrategy.SHALLOW_MERGE : undefined;
    const result = customDeepMerge(getMergeStrategy, target, source);
    // This is still a deep merge, but the properties of the object are merged.
    expect(result).toEqual({ a: { x: 1, y: 2, z: 2 } });
  });

  it('should handle multiple source objects', () => {
    const target = { a: 1 };
    const source1 = { b: 2 };
    const source2 = { c: 3 };
    const getMergeStrategy = () => undefined;
    const result = customDeepMerge(getMergeStrategy, target, source1, source2);
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('should return an empty object if no sources are provided', () => {
    const getMergeStrategy = () => undefined;
    const result = customDeepMerge(getMergeStrategy);
    expect(result).toEqual({});
  });

  it('should return a deep copy of the first source if only one is provided', () => {
    const target = { a: { b: 1 } };
    const getMergeStrategy = () => undefined;
    const result = customDeepMerge(getMergeStrategy, target);
    expect(result).toEqual(target);
    expect(result).not.toBe(target);
  });

  it('should not mutate the original source objects', () => {
    const target = { a: { x: 1 }, b: [1, 2] };
    const source = { a: { y: 2 }, b: [3, 4] };
    const originalTarget = JSON.parse(JSON.stringify(target));
    const originalSource = JSON.parse(JSON.stringify(source));
    const getMergeStrategy = () => undefined;

    customDeepMerge(getMergeStrategy, target, source);

    expect(target).toEqual(originalTarget);
    expect(source).toEqual(originalSource);
  });

  it('should not mutate sources when merging multiple levels deep', () => {
    const s1 = { data: { common: { val: 'from s1' }, s1_only: true } };
    const s2 = { data: { common: { val: 'from s2' }, s2_only: true } };
    const s1_original = JSON.parse(JSON.stringify(s1));
    const s2_original = JSON.parse(JSON.stringify(s2));

    const getMergeStrategy = () => undefined;
    const result = customDeepMerge(getMergeStrategy, s1, s2);

    expect(s1).toEqual(s1_original);
    expect(s2).toEqual(s2_original);
    expect(result).toEqual({
      data: {
        common: { val: 'from s2' },
        s1_only: true,
        s2_only: true,
      },
    });
  });

  it('should handle complex nested strategies', () => {
    const target = {
      level1: {
        arr1: [1, 2],
        arr2: [1, 2],
        obj1: { a: 1 },
      },
    };
    const source = {
      level1: {
        arr1: [3, 4],
        arr2: [2, 3],
        obj1: { b: 2 },
      },
    };
    const getMergeStrategy = (path: string[]) => {
      const p = path.join('.');
      if (p === 'level1.arr1') return MergeStrategy.CONCAT;
      if (p === 'level1.arr2') return MergeStrategy.UNION;
      if (p === 'level1.obj1') return MergeStrategy.SHALLOW_MERGE;
      return undefined;
    };

    const result = customDeepMerge(getMergeStrategy, target, source);

    expect(result).toEqual({
      level1: {
        arr1: [1, 2, 3, 4],
        arr2: [1, 2, 3],
        obj1: { a: 1, b: 2 },
      },
    });
  });

  it('should not pollute the prototype', () => {
    const maliciousSource = JSON.parse('{"__proto__": {"polluted": "true"}}');
    const getMergeStrategy = () => undefined;
    const result = customDeepMerge(getMergeStrategy, {}, maliciousSource);

    expect(result).toEqual({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(({} as any).polluted).toBeUndefined();
  });
});
