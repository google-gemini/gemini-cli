/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { LruCache } from './LruCache.js';

describe('LruCache', () => {
  it('should store and retrieve values', () => {
    const cache = new LruCache<string, number>(10);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
  });

  it('should evict oldest items when limit is reached', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('should update LRU order on get', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // Mark 'a' as recently used
    cache.set('c', 3); // Should evict 'b'

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  it('should correctly handle falsy values (truthiness bug fix)', () => {
    const cache = new LruCache<string, unknown>(2);
    cache.set('zero', 0);
    cache.set('empty', '');

    // Both should be in cache
    expect(cache.get('zero')).toBe(0);
    expect(cache.get('empty')).toBe('');

    // Access 'zero' to move it to end
    cache.get('zero');

    // Add new item, should evict 'empty' (because 'zero' was just accessed)
    cache.set('new', 'item');

    expect(cache.get('empty')).toBeUndefined();
    expect(cache.get('zero')).toBe(0);
    expect(cache.get('new')).toBe('item');
  });

  it('should correctly handle undefined as a value', () => {
    // NOTE: mnemonist LRUMap returns undefined if not found.
    // If we store undefined, we can't distinguish between "not found" and "found undefined".
    // But we should at least check its behavior.
    const cache = new LruCache<string, unknown>(10);
    cache.set('key', undefined);
    expect(cache.has('key')).toBe(true);
    expect(cache.get('key')).toBeUndefined();
  });
});
