/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { LruCache } from './LruCache.js';

describe('LruCache', () => {
  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      const cache = new LruCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });

    it('should return undefined for non-existent keys', () => {
      const cache = new LruCache<string, number>(3);
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing values', () => {
      const cache = new LruCache<string, number>(3);
      cache.set('a', 1);
      cache.set('a', 10);
      expect(cache.get('a')).toBe(10);
    });

    it('should clear all entries', () => {
      const cache = new LruCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      cache.clear();

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBeUndefined();
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used item when capacity is exceeded', () => {
      const cache = new LruCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // Should evict 'a'

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    it('should update LRU order on get access', () => {
      const cache = new LruCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a', making it recently used
      cache.get('a');

      // Add 'd', should evict 'b' (now least recently used)
      cache.set('d', 4);

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    it('should update LRU order on set update', () => {
      const cache = new LruCache<string, number>(3);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Update 'a', making it recently used
      cache.set('a', 10);

      // Add 'd', should evict 'b' (now least recently used)
      cache.set('d', 4);

      expect(cache.get('a')).toBe(10);
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    it('should handle sequential evictions correctly', () => {
      const cache = new LruCache<string, number>(2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // Evicts 'a'
      cache.set('d', 4); // Evicts 'b'

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });
  });

  describe('edge cases', () => {
    it('should handle cache with size 1', () => {
      const cache = new LruCache<string, number>(1);
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);

      cache.set('b', 2);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
    });

    it('should handle cache with size 0', () => {
      const cache = new LruCache<string, number>(0);
      cache.set('a', 1);
      // With size 0, everything should be evicted immediately
      expect(cache.get('a')).toBeUndefined();
    });

    it('should work with different key and value types', () => {
      const cache = new LruCache<number, string>(2);
      cache.set(1, 'one');
      cache.set(2, 'two');

      expect(cache.get(1)).toBe('one');
      expect(cache.get(2)).toBe('two');
    });

    it('should work with object values', () => {
      const cache = new LruCache<string, { value: number }>(2);
      const obj1 = { value: 1 };
      const obj2 = { value: 2 };

      cache.set('a', obj1);
      cache.set('b', obj2);

      expect(cache.get('a')).toBe(obj1);
      expect(cache.get('b')).toBe(obj2);
    });

    it('should handle falsy values correctly', () => {
      const cache = new LruCache<string, number | null | undefined>(3);
      cache.set('zero', 0);
      cache.set('null', null);
      cache.set('undefined', undefined);

      expect(cache.get('zero')).toBe(0);
      expect(cache.get('null')).toBe(null);
      expect(cache.get('undefined')).toBe(undefined);
    });
  });

  describe('complex LRU scenarios', () => {
    it('should maintain correct order with mixed get and set operations', () => {
      const cache = new LruCache<string, number>(3);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access order: a, b, c

      cache.get('a'); // Order: b, c, a
      cache.get('b'); // Order: c, a, b

      cache.set('d', 4); // Should evict 'c', Order: a, b, d

      expect(cache.get('c')).toBeUndefined();
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('d')).toBe(4);
    });

    it('should handle accessing non-existent keys without affecting LRU order', () => {
      const cache = new LruCache<string, number>(3);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access non-existent key
      cache.get('nonexistent');

      // Add new item, should still evict 'a'
      cache.set('d', 4);

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    it('should handle clearing and refilling cache', () => {
      const cache = new LruCache<string, number>(2);

      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();

      cache.set('c', 3);
      cache.set('d', 4);

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });
  });
});
