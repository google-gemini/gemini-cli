/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { getCacheKey, read, write, clear } from './crawlCache.js';

describe('CrawlCache', () => {
  describe('getCacheKey', () => {
    it('should generate a consistent hash', () => {
      const key1 = getCacheKey('/foo', 'bar');
      const key2 = getCacheKey('/foo', 'bar');
      expect(key1).toBe(key2);
    });

    it('should generate a different hash for different directories', () => {
      const key1 = getCacheKey('/foo', 'bar');
      const key2 = getCacheKey('/bar', 'bar');
      expect(key1).not.toBe(key2);
    });

    it('should generate a different hash for different ignore content', () => {
      const key1 = getCacheKey('/foo', 'bar');
      const key2 = getCacheKey('/foo', 'baz');
      expect(key1).not.toBe(key2);
    });

    it('should generate a different hash for different maxDepth values', () => {
      const key1 = getCacheKey('/foo', 'bar', 1);
      const key2 = getCacheKey('/foo', 'bar', 2);
      const key3 = getCacheKey('/foo', 'bar', undefined);
      const key4 = getCacheKey('/foo', 'bar');
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
      expect(key3).toBe(key4);
    });
  });

  describe('in-memory cache operations', () => {
    beforeEach(() => {
      // Ensure a clean slate before each test
      clear();
    });

    afterEach(() => {
      // Restore real timers after each test that uses fake ones
      vi.useRealTimers();
    });

    it('should write and read data from the cache', () => {
      const key = 'test-key';
      const data = ['foo', 'bar'];
      write(key, data, 10000); // 10 second TTL
      const cachedData = read(key);
      expect(cachedData).toEqual(data);
    });

    it('should return undefined for a nonexistent key', () => {
      const cachedData = read('nonexistent-key');
      expect(cachedData).toBeUndefined();
    });

    it('should clear the cache', () => {
      const key = 'test-key';
      const data = ['foo', 'bar'];
      write(key, data, 10000);
      clear();
      const cachedData = read(key);
      expect(cachedData).toBeUndefined();
    });

    it('should automatically evict a cache entry after its TTL expires', async () => {
      vi.useFakeTimers();
      const key = 'ttl-key';
      const data = ['foo'];
      const ttl = 5000; // 5 seconds

      write(key, data, ttl);

      // Should exist immediately after writing
      expect(read(key)).toEqual(data);

      // Advance time just before expiration
      await vi.advanceTimersByTimeAsync(ttl - 1);
      expect(read(key)).toEqual(data);

      // Advance time past expiration
      await vi.advanceTimersByTimeAsync(1);
      expect(read(key)).toBeUndefined();
    });

    it('should reset the timer when an entry is updated', async () => {
      vi.useFakeTimers();
      const key = 'update-key';
      const initialData = ['initial'];
      const updatedData = ['updated'];
      const ttl = 5000; // 5 seconds

      // Write initial data
      write(key, initialData, ttl);

      // Advance time, but not enough to expire
      await vi.advanceTimersByTimeAsync(3000);
      expect(read(key)).toEqual(initialData);

      // Update the data, which should reset the timer
      write(key, updatedData, ttl);
      expect(read(key)).toEqual(updatedData);

      // Advance time again. If the timer wasn't reset, the total elapsed
      // time (3000 + 3000 = 6000) would cause an eviction.
      await vi.advanceTimersByTimeAsync(3000);
      expect(read(key)).toEqual(updatedData);

      // Advance past the new expiration time
      await vi.advanceTimersByTimeAsync(2001);
      expect(read(key)).toBeUndefined();
    });
  });
});
