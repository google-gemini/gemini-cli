/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCache } from './cache.js';

describe('CacheService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic operations', () => {
    it('should store and retrieve values by default (Map)', () => {
      const cache = createCache<string, string>({ storage: 'map' });
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });

    it('should return undefined for missing keys', () => {
      const cache = createCache<string, string>({ storage: 'map' });
      expect(cache.get('missing')).toBeUndefined();
    });

    it('should delete entries', () => {
      const cache = createCache<string, string>({ storage: 'map' });
      cache.set('key', 'value');
      cache.delete('key');
      expect(cache.get('key')).toBeUndefined();
    });

    it('should clear all entries (Map)', () => {
      const cache = createCache<string, string>({ storage: 'map' });
      cache.set('k1', 'v1');
      cache.set('k2', 'v2');
      cache.clear();
      expect(cache.get('k1')).toBeUndefined();
      expect(cache.get('k2')).toBeUndefined();
    });

    it('should throw on clear() for WeakMap', () => {
      const cache = createCache<object, string>({ storage: 'weakmap' });
      expect(() => cache.clear()).toThrow(
        'clear() is not supported on WeakMap storage',
      );
    });
  });

  describe('TTL and Expiration', () => {
    it('should expire entries based on defaultTtl', () => {
      const cache = createCache<string, string>({
        storage: 'map',
        defaultTtl: 1000,
      });
      cache.set('key', 'value');

      vi.advanceTimersByTime(500);
      expect(cache.get('key')).toBe('value');

      vi.advanceTimersByTime(600); // Total 1100
      expect(cache.get('key')).toBeUndefined();
    });

    it('should expire entries based on specific ttl override', () => {
      const cache = createCache<string, string>({
        storage: 'map',
        defaultTtl: 5000,
      });
      cache.set('key', 'value', 1000);

      vi.advanceTimersByTime(1100);
      expect(cache.get('key')).toBeUndefined();
    });

    it('should not expire if ttl is undefined', () => {
      const cache = createCache<string, string>({ storage: 'map' });
      cache.set('key', 'value');

      vi.advanceTimersByTime(100000);
      expect(cache.get('key')).toBe('value');
    });
  });

  describe('getOrCreate', () => {
    it('should return existing value if not expired', () => {
      const cache = createCache<string, string>({ storage: 'map' });
      cache.set('key', 'old');
      const creator = vi.fn().mockReturnValue('new');

      const result = cache.getOrCreate('key', creator);
      expect(result).toBe('old');
      expect(creator).not.toHaveBeenCalled();
    });

    it('should create and store value if missing', () => {
      const cache = createCache<string, string>({ storage: 'map' });
      const creator = vi.fn().mockReturnValue('new');

      const result = cache.getOrCreate('key', creator);
      expect(result).toBe('new');
      expect(creator).toHaveBeenCalled();
      expect(cache.get('key')).toBe('new');
    });

    it('should recreate value if expired', () => {
      const cache = createCache<string, string>({
        storage: 'map',
        defaultTtl: 1000,
      });
      cache.set('key', 'old');
      vi.advanceTimersByTime(1100);

      const creator = vi.fn().mockReturnValue('new');
      const result = cache.getOrCreate('key', creator);
      expect(result).toBe('new');
      expect(creator).toHaveBeenCalled();
    });
  });

  describe('Promise Support', () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    it('should remove failed promises from cache by default', async () => {
      const cache = createCache<string, Promise<string>>({ storage: 'map' });
      const promise = Promise.reject(new Error('fail'));

      // We need to catch it to avoid unhandled rejection in test
      promise.catch(() => {});

      cache.set('key', promise);
      expect(cache.get('key')).toBe(promise);

      // Wait for promise to settle
      await new Promise((resolve) => setImmediate(resolve));

      expect(cache.get('key')).toBeUndefined();
    });

    it('should NOT remove failed promises if deleteOnPromiseFailure is false', async () => {
      const cache = createCache<string, Promise<string>>({
        storage: 'map',
        deleteOnPromiseFailure: false,
      });
      const promise = Promise.reject(new Error('fail'));
      promise.catch(() => {});

      cache.set('key', promise);

      await new Promise((resolve) => setImmediate(resolve));

      expect(cache.get('key')).toBe(promise);
    });

    it('should only delete the specific failed entry', async () => {
      const cache = createCache<string, Promise<string>>({ storage: 'map' });

      const failPromise = Promise.reject(new Error('fail'));
      failPromise.catch(() => {});

      cache.set('key', failPromise);

      // Overwrite with a new success promise before failure settles
      const successPromise = Promise.resolve('ok');
      cache.set('key', successPromise);

      await new Promise((resolve) => setImmediate(resolve));

      // Should still be successPromise
      expect(cache.get('key')).toBe(successPromise);
    });
  });

  describe('WeakMap Storage', () => {
    it('should work with object keys explicitly', () => {
      const cache = createCache<object, string>({ storage: 'weakmap' });
      const key = { id: 1 };
      cache.set(key, 'value');
      expect(cache.get(key)).toBe('value');
    });

    it('should default to Map for objects', () => {
      const cache = createCache<object, string>();
      const key = { id: 1 };
      cache.set(key, 'value');
      expect(cache.get(key)).toBe('value');
      // clear() should NOT throw because default is Map
      expect(() => cache.clear()).not.toThrow();
    });
  });
});
