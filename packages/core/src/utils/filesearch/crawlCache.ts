/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';

const crawlCache = new Map<string, string[]>();
const cacheTimers = new Map<string, NodeJS.Timeout>();

/**
 * Generates a unique cache key based on the project directory and the content
 * of ignore files. This ensures that the cache is invalidated if the project
 * or ignore rules change.
 */
export const getCacheKey = (
  directory: string,
  ignoreContent: string,
  maxDepth?: number,
): string => {
  const hash = crypto.createHash('sha256');
  hash.update(directory);
  hash.update(ignoreContent);
  if (maxDepth !== undefined) {
    hash.update(String(maxDepth));
  }
  return hash.digest('hex');
};

/**
 * Reads cached data from the in-memory cache.
 * Returns undefined if the key is not found.
 */
export const read = (key: string): string[] | undefined => crawlCache.get(key);

/**
 * Writes data to the in-memory cache and sets a timer to evict it after the TTL.
 */
export const write = (key: string, results: string[], ttlMs: number): void => {
  // Clear any existing timer for this key to prevent premature deletion
  if (cacheTimers.has(key)) {
    clearTimeout(cacheTimers.get(key)!);
  }

  // Store the new data
  crawlCache.set(key, results);

  // Set a timer to automatically delete the cache entry after the TTL
  const timerId = setTimeout(() => {
    crawlCache.delete(key);
    cacheTimers.delete(key);
  }, ttlMs);

  // Store the timer handle so we can clear it if the entry is updated
  cacheTimers.set(key, timerId);
};

/**
 * Clears the entire cache and all active timers.
 * Primarily used for testing.
 */
export const clear = (): void => {
  for (const timerId of cacheTimers.values()) {
    clearTimeout(timerId);
  }
  crawlCache.clear();
  cacheTimers.clear();
};
