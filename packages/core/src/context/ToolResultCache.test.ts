/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToolResultCache } from './ToolResultCache.js';
import { CachedToolResult, CacheStats } from './memory-interfaces.js';

describe('ToolResultCache', () => {
  let cache: ToolResultCache;
  const toolName = 'test_tool';

  beforeEach(() => {
    cache = new ToolResultCache(toolName, {
      maxSize: 1024 * 1024, // 1MB
      defaultTtl: 60 * 1000, // 1 minute
      maxResultSize: 512 * 1024, // 512KB
      cleanupInterval: 30 * 1000, // 30 seconds
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cache operations', () => {
    it('should cache and retrieve results', async () => {
      const key = 'test-key';
      const result: CachedToolResult = {
        key,
        parameters: { input: 'test' },
        result: { output: 'test result' },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 100,
        valid: true,
        dependencies: [],
      };

      await cache.set(key, result);
      const retrieved = await cache.get(key);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.key).toBe(key);
      expect(retrieved?.result).toEqual({ output: 'test result' });
      expect(retrieved?.accessCount).toBe(1); // Should increment on access
    });

    it('should return undefined for non-existent keys', async () => {
      const result = await cache.get('non-existent-key');
      expect(result).toBeUndefined();
    });

    it('should update access count and last accessed time', async () => {
      const key = 'access-test';
      const result: CachedToolResult = {
        key,
        parameters: {},
        result: { data: 'test' },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 50,
        valid: true,
        dependencies: [],
      };

      await cache.set(key, result);
      
      const firstAccess = await cache.get(key);
      expect(firstAccess?.accessCount).toBe(1);
      
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const secondAccess = await cache.get(key);
      expect(secondAccess?.accessCount).toBe(2);
      expect(secondAccess?.lastAccessed).toBeGreaterThan(firstAccess!.lastAccessed);
    });
  });

  describe('TTL and expiration', () => {
    it('should respect TTL settings', async () => {
      const key = 'ttl-test';
      const shortTtl = 100; // 100ms
      const result: CachedToolResult = {
        key,
        parameters: {},
        result: { data: 'expires soon' },
        timestamp: Date.now(),
        ttl: shortTtl,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 50,
        valid: true,
        dependencies: [],
      };

      await cache.set(key, result);
      
      // Should be available immediately
      let retrieved = await cache.get(key);
      expect(retrieved).toBeDefined();
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, shortTtl + 50));
      
      // Should be expired now
      retrieved = await cache.get(key);
      expect(retrieved).toBeUndefined();
    });

    it('should handle custom TTL per result', async () => {
      const shortKey = 'short-ttl';
      const longKey = 'long-ttl';
      
      const shortResult: CachedToolResult = {
        key: shortKey,
        parameters: {},
        result: { data: 'short' },
        timestamp: Date.now(),
        ttl: 50, // 50ms
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 30,
        valid: true,
        dependencies: [],
      };

      const longResult: CachedToolResult = {
        key: longKey,
        parameters: {},
        result: { data: 'long' },
        timestamp: Date.now(),
        ttl: 5000, // 5 seconds
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 30,
        valid: true,
        dependencies: [],
      };

      await cache.set(shortKey, shortResult);
      await cache.set(longKey, longResult);
      
      // Wait for short TTL to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(await cache.get(shortKey)).toBeUndefined();
      expect(await cache.get(longKey)).toBeDefined();
    });
  });

  describe('size limits', () => {
    it('should enforce maximum result size', async () => {
      const key = 'large-result';
      const largeData = 'x'.repeat(600 * 1024); // 600KB, exceeds 512KB limit
      
      const result: CachedToolResult = {
        key,
        parameters: {},
        result: { data: largeData },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: largeData.length,
        valid: true,
        dependencies: [],
      };

      const success = await cache.set(key, result);
      expect(success).toBe(false);
      
      const retrieved = await cache.get(key);
      expect(retrieved).toBeUndefined();
    });

    it('should enforce total cache size limit', async () => {
      // Create a cache with small size limit
      const smallCache = new ToolResultCache('small_tool', {
        maxSize: 1024, // 1KB
        defaultTtl: 60000,
        maxResultSize: 512,
        cleanupInterval: 30000,
      });

      const results: CachedToolResult[] = [];
      for (let i = 0; i < 5; i++) {
        results.push({
          key: `key-${i}`,
          parameters: { index: i },
          result: { data: 'x'.repeat(300) }, // 300 bytes each
          timestamp: Date.now(),
          ttl: 60000,
          accessCount: 0,
          lastAccessed: Date.now(),
          size: 300,
          valid: true,
          dependencies: [],
        });
      }

      // Add results until cache is full
      for (const result of results) {
        await smallCache.set(result.key, result);
      }

      const stats = await smallCache.getStats();
      expect(stats.totalSize).toBeLessThanOrEqual(1024);
      expect(stats.evictions).toBeGreaterThan(0);
    });

    it('should use LRU eviction strategy', async () => {
      const smallCache = new ToolResultCache('lru_tool', {
        maxSize: 500, // 500 bytes
        defaultTtl: 60000,
        maxResultSize: 200,
        cleanupInterval: 30000,
      });

      // Add three items, each 150 bytes
      await smallCache.set('key1', {
        key: 'key1',
        parameters: {},
        result: { data: 'x'.repeat(100) },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 150,
        valid: true,
        dependencies: [],
      });

      await smallCache.set('key2', {
        key: 'key2',
        parameters: {},
        result: { data: 'y'.repeat(100) },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 150,
        valid: true,
        dependencies: [],
      });

      await smallCache.set('key3', {
        key: 'key3',
        parameters: {},
        result: { data: 'z'.repeat(100) },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 150,
        valid: true,
        dependencies: [],
      });

      // Access key1 to make it recently used
      await smallCache.get('key1');

      // Add key4, should evict key2 (least recently used)
      await smallCache.set('key4', {
        key: 'key4',
        parameters: {},
        result: { data: 'w'.repeat(100) },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 150,
        valid: true,
        dependencies: [],
      });

      expect(await smallCache.get('key1')).toBeDefined(); // Recently accessed
      expect(await smallCache.get('key2')).toBeUndefined(); // Should be evicted
      expect(await smallCache.get('key3')).toBeDefined();
      expect(await smallCache.get('key4')).toBeDefined();
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate cache entries by dependency', async () => {
      const key1 = 'dependent-key1';
      const key2 = 'dependent-key2';
      const key3 = 'independent-key';
      const dependency = '/test/file.ts';

      const result1: CachedToolResult = {
        key: key1,
        parameters: { file: dependency },
        result: { content: 'file content' },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 100,
        valid: true,
        dependencies: [dependency],
      };

      const result2: CachedToolResult = {
        key: key2,
        parameters: { related: dependency },
        result: { analysis: 'file analysis' },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 100,
        valid: true,
        dependencies: [dependency],
      };

      const result3: CachedToolResult = {
        key: key3,
        parameters: { unrelated: 'data' },
        result: { other: 'data' },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 100,
        valid: true,
        dependencies: [],
      };

      await cache.set(key1, result1);
      await cache.set(key2, result2);
      await cache.set(key3, result3);

      // Invalidate by dependency
      await cache.invalidateByDependency(dependency);

      expect(await cache.get(key1)).toBeUndefined();
      expect(await cache.get(key2)).toBeUndefined();
      expect(await cache.get(key3)).toBeDefined(); // Should remain
    });

    it('should invalidate specific cache entries', async () => {
      const key1 = 'key1';
      const key2 = 'key2';

      await cache.set(key1, {
        key: key1,
        parameters: {},
        result: { data: '1' },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 50,
        valid: true,
        dependencies: [],
      });

      await cache.set(key2, {
        key: key2,
        parameters: {},
        result: { data: '2' },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 50,
        valid: true,
        dependencies: [],
      });

      await cache.invalidate(key1);

      expect(await cache.get(key1)).toBeUndefined();
      expect(await cache.get(key2)).toBeDefined();
    });

    it('should clear all cache entries', async () => {
      await cache.set('key1', {
        key: 'key1',
        parameters: {},
        result: { data: '1' },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 50,
        valid: true,
        dependencies: [],
      });

      await cache.set('key2', {
        key: 'key2',
        parameters: {},
        result: { data: '2' },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 50,
        valid: true,
        dependencies: [],
      });

      await cache.clear();

      expect(await cache.get('key1')).toBeUndefined();
      expect(await cache.get('key2')).toBeUndefined();
      
      const stats = await cache.getStats();
      expect(stats.itemCount).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe('cleanup and maintenance', () => {
    it('should perform cleanup of expired entries', async () => {
      const expiredKey = 'expired';
      const validKey = 'valid';

      await cache.set(expiredKey, {
        key: expiredKey,
        parameters: {},
        result: { data: 'expired' },
        timestamp: Date.now() - 120000, // 2 minutes ago
        ttl: 60000, // 1 minute TTL
        accessCount: 0,
        lastAccessed: Date.now() - 120000,
        size: 50,
        valid: true,
        dependencies: [],
      });

      await cache.set(validKey, {
        key: validKey,
        parameters: {},
        result: { data: 'valid' },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 50,
        valid: true,
        dependencies: [],
      });

      const statsBeforeCleanup = await cache.getStats();
      expect(statsBeforeCleanup.itemCount).toBe(2);

      await cache.cleanup();

      const statsAfterCleanup = await cache.getStats();
      expect(statsAfterCleanup.itemCount).toBe(1);
      expect(statsAfterCleanup.expirations).toBeGreaterThan(0);
      
      expect(await cache.get(expiredKey)).toBeUndefined();
      expect(await cache.get(validKey)).toBeDefined();
    });

    it('should automatically cleanup on interval', async () => {
      const autoCleanupCache = new ToolResultCache('auto_cleanup_tool', {
        maxSize: 1024 * 1024,
        defaultTtl: 100, // 100ms
        maxResultSize: 512 * 1024,
        cleanupInterval: 200, // 200ms
      });

      await autoCleanupCache.set('expiring', {
        key: 'expiring',
        parameters: {},
        result: { data: 'will expire' },
        timestamp: Date.now(),
        ttl: 100,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 50,
        valid: true,
        dependencies: [],
      });

      // Wait for automatic cleanup
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(await autoCleanupCache.get('expiring')).toBeUndefined();
    });
  });

  describe('statistics and monitoring', () => {
    it('should track cache statistics', async () => {
      // Add some items
      await cache.set('key1', {
        key: 'key1',
        parameters: {},
        result: { data: 'test1' },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 100,
        valid: true,
        dependencies: [],
      });

      await cache.set('key2', {
        key: 'key2',
        parameters: {},
        result: { data: 'test2' },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 150,
        valid: true,
        dependencies: [],
      });

      // Access items to generate hits
      await cache.get('key1');
      await cache.get('key1');
      await cache.get('key2');

      // Generate a miss
      await cache.get('nonexistent');

      const stats = await cache.getStats();
      
      expect(stats.itemCount).toBe(2);
      expect(stats.totalSize).toBe(250);
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(1);
      expect(stats.hitRatio).toBeCloseTo(0.75); // 3/4 = 0.75
    });

    it('should calculate hit ratio correctly', async () => {
      // Start fresh
      const newCache = new ToolResultCache('stats_tool', {
        maxSize: 1024 * 1024,
        defaultTtl: 60000,
        maxResultSize: 512 * 1024,
        cleanupInterval: 30000,
      });

      await newCache.set('item', {
        key: 'item',
        parameters: {},
        result: { data: 'test' },
        timestamp: Date.now(),
        ttl: 60000,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: 50,
        valid: true,
        dependencies: [],
      });

      // 2 hits
      await newCache.get('item');
      await newCache.get('item');

      // 3 misses
      await newCache.get('miss1');
      await newCache.get('miss2');
      await newCache.get('miss3');

      const stats = await newCache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(3);
      expect(stats.hitRatio).toBeCloseTo(0.4); // 2/5 = 0.4
    });
  });

  describe('key generation and hashing', () => {
    it('should generate consistent keys for same parameters', () => {
      const params1 = { file: '/test/file.ts', options: { format: true } };
      const params2 = { file: '/test/file.ts', options: { format: true } };
      const params3 = { file: '/test/other.ts', options: { format: true } };

      const key1 = cache.generateKey(params1);
      const key2 = cache.generateKey(params2);
      const key3 = cache.generateKey(params3);

      expect(key1).toBe(key2); // Same parameters should produce same key
      expect(key1).not.toBe(key3); // Different parameters should produce different key
    });

    it('should handle complex parameter objects', () => {
      const complexParams = {
        files: ['/test/a.ts', '/test/b.ts'],
        options: {
          nested: {
            deep: {
              value: true,
              array: [1, 2, 3],
            },
          },
        },
        callback: 'function reference', // Functions should be stringified
      };

      const key = cache.generateKey(complexParams);
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    it('should ignore parameter order for object properties', () => {
      const params1 = { a: 1, b: 2, c: 3 };
      const params2 = { c: 3, a: 1, b: 2 };

      const key1 = cache.generateKey(params1);
      const key2 = cache.generateKey(params2);

      expect(key1).toBe(key2);
    });
  });
});