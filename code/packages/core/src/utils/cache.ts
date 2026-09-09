/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CacheEntry<V> {
  value: V;
  timestamp: number;
  ttl?: number;
}

export interface CacheOptions {
  /**
   * Default Time To Live in milliseconds.
   */
  defaultTtl?: number;

  /**
   * If true, and V is a Promise, the entry will be removed from the cache
   * if the promise rejects.
   */
  deleteOnPromiseFailure?: boolean;

  /**
   * The underlying storage mechanism.
   * Use 'weakmap' (default) for object keys to allow garbage collection.
   * Use 'map' if you need to use strings as keys or need the clear() method.
   */
  storage?: 'map' | 'weakmap';
}

/**
 * A generic caching service with TTL support.
 */
export class CacheService<K extends object | string | undefined, V> {
  private readonly storage:
    | Map<K, CacheEntry<V>>
    | WeakMap<WeakKey, CacheEntry<V>>;
  private readonly defaultTtl?: number;
  private readonly deleteOnPromiseFailure: boolean;

  constructor(options: CacheOptions = {}) {
    // Default to map for safety unless weakmap is explicitly requested.
    this.storage =
      options.storage === 'weakmap'
        ? new WeakMap<WeakKey, CacheEntry<V>>()
        : new Map<K, CacheEntry<V>>();
    this.defaultTtl = options.defaultTtl;
    this.deleteOnPromiseFailure = options.deleteOnPromiseFailure ?? true;
  }

  /**
   * Retrieves a value from the cache. Returns undefined if missing or expired.
   */
  get(key: K): V | undefined {
    // We have to cast to Map or WeakMap specifically to call get()
    // but since they have the same signature for object keys, we can
    // safely cast to 'any' internally for the dispatch.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
    const entry = (this.storage as any).get(key) as CacheEntry<V> | undefined;
    if (!entry) {
      return undefined;
    }

    const ttl = entry.ttl ?? this.defaultTtl;
    if (ttl !== undefined && Date.now() - entry.timestamp > ttl) {
      this.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Stores a value in the cache.
   */
  set(key: K, value: V, ttl?: number): void {
    const entry: CacheEntry<V> = {
      value,
      timestamp: Date.now(),
      ttl,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
    (this.storage as any).set(key, entry);

    if (this.deleteOnPromiseFailure && value instanceof Promise) {
      value.catch(() => {
        // Only delete if this exact entry is still in the cache
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
        if ((this.storage as any).get(key) === entry) {
          this.delete(key);
        }
      });
    }
  }

  /**
   * Helper to retrieve a value or create it if missing/expired.
   */
  getOrCreate(key: K, creator: () => V, ttl?: number): V {
    let value = this.get(key);
    if (value === undefined) {
      value = creator();
      this.set(key, value, ttl);
    }
    return value;
  }

  /**
   * Removes an entry from the cache.
   */
  delete(key: K): void {
    if (this.storage instanceof Map) {
      this.storage.delete(key);
    } else {
      // WeakMap.delete returns a boolean, we can ignore it.
      // Cast to any to bypass the WeakKey constraint since we've already
      // confirmed the storage type.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
      (this.storage as any).delete(key);
    }
  }

  /**
   * Clears all entries. Only supported if using Map storage.
   */
  clear(): void {
    if (this.storage instanceof Map) {
      this.storage.clear();
    } else {
      throw new Error('clear() is not supported on WeakMap storage');
    }
  }
}

/**
 * Factory function to create a new cache.
 */
export function createCache<K extends string | undefined, V>(
  options: CacheOptions & { storage: 'map' },
): CacheService<K, V>;
export function createCache<K extends object, V>(
  options?: CacheOptions,
): CacheService<K, V>;
export function createCache<K extends object | string | undefined, V>(
  options: CacheOptions = {},
): CacheService<K, V> {
  return new CacheService<K, V>(options);
}
