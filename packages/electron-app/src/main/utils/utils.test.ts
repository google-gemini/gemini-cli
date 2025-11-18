/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { deepMerge } from './utils';

describe('deepMerge', () => {
  it('should merge two objects deeply', () => {
    const target = { a: 1, b: { c: 2 } };
    const source = { b: { d: 3 }, e: 4 };
    const result = deepMerge(target, source);
    expect(result).toEqual({ a: 1, b: { c: 2, d: 3 }, e: 4 });
  });

  it('should prevent prototype pollution via __proto__', () => {
    const target = {};
    const source = JSON.parse('{"__proto__": {"polluted": true}}');
    const result = deepMerge(target, source);

    // Check it didn't pollute the global Object prototype
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // Also check it didn't set it on the result object itself as a prototype
    expect(
      (Object.getPrototypeOf(result) as Record<string, unknown>).polluted,
    ).toBeUndefined();
  });

  it('should prevent prototype pollution via constructor', () => {
    const target = {};
    const source = { constructor: { prototype: { polluted: true } } };
    deepMerge(target, source);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('should prevent prototype pollution via prototype', () => {
    const target = {};
    const source = { prototype: { polluted: true } };
    const result = deepMerge(target, source);
    expect((result as Record<string, unknown>).prototype).toBeUndefined();
  });
});
