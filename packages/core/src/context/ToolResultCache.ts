/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ToolResultCache as IToolResultCache,
  CachedToolResult,
  CacheStats,
} from './memory-interfaces.js';
import * as crypto from 'crypto';

/**
 * Configuration options for ToolResultCache
 */
export interface ToolResultCacheConfig {
  maxSize: number;
  defaultTtl: number;
  maxResultSize: number;
  cleanupInterval: number;
}

/**
 * Implementation of tool result caching with LRU eviction and TTL support
 */
export class ToolResultCache implements IToolResultCache {
  public readonly toolName: string;
  public readonly results = new Map<string, CachedToolResult>();
  public readonly maxSize: number;
  public readonly stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRatio: 0,
    totalSize: 0,
    itemCount: 0,
    evictions: 0,
    expirations: 0,
  };
  public lastCleanup: number = Date.now();
  public readonly cleanupInterval: number;

  private readonly defaultTtl: number;
  private readonly maxResultSize: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(toolName: string, config: ToolResultCacheConfig) {
    this.toolName = toolName;
    this.maxSize = config.maxSize;
    this.defaultTtl = config.defaultTtl;
    this.maxResultSize = config.maxResultSize;
    this.cleanupInterval = config.cleanupInterval;

    // Start automatic cleanup
    this.scheduleCleanup();
  }

  /**
   * Store a result in the cache
   */
  async set(key: string, result: CachedToolResult): Promise<boolean> {
    // Check if result is too large
    if (result.size > this.maxResultSize) {
      return false;
    }

    // Remove existing entry if it exists
    if (this.results.has(key)) {
      const existing = this.results.get(key)!;
      this.stats.totalSize -= existing.size;
      this.results.delete(key);
    }

    // Check if we need to evict entries to make space
    while (this.stats.totalSize + result.size > this.maxSize && this.results.size > 0) {
      this.evictLeastRecentlyUsed();
    }

    // Store the result
    this.results.set(key, { ...result });
    this.stats.totalSize += result.size;
    this.stats.itemCount = this.results.size;
    this.updateHitRatio();

    return true;
  }

  /**
   * Retrieve a result from the cache
   */
  async get(key: string): Promise<CachedToolResult | undefined> {
    const result = this.results.get(key);
    
    if (!result) {
      this.stats.misses++;
      this.updateHitRatio();
      return undefined;
    }

    // Check if result has expired
    if (this.isExpired(result)) {
      this.results.delete(key);
      this.stats.totalSize -= result.size;
      this.stats.itemCount = this.results.size;
      this.stats.expirations++;
      this.stats.misses++;
      this.updateHitRatio();
      return undefined;
    }

    // Update access information
    result.accessCount++;
    result.lastAccessed = Date.now();
    
    // Move to end to mark as recently used (LRU)
    this.results.delete(key);
    this.results.set(key, result);

    this.stats.hits++;
    this.updateHitRatio();

    return { ...result };
  }

  /**
   * Invalidate a specific cache entry
   */
  async invalidate(key: string): Promise<void> {
    const result = this.results.get(key);
    if (result) {
      this.results.delete(key);
      this.stats.totalSize -= result.size;
      this.stats.itemCount = this.results.size;
    }
  }

  /**
   * Invalidate cache entries that depend on a specific file or resource
   */
  async invalidateByDependency(dependency: string): Promise<void> {
    const keysToDelete: string[] = [];
    
    for (const [key, result] of this.results.entries()) {
      if (result.dependencies.includes(dependency)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      await this.invalidate(key);
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.results.clear();
    this.stats.totalSize = 0;
    this.stats.itemCount = 0;
  }

  /**
   * Perform cleanup of expired entries
   */
  async cleanup(): Promise<void> {
    const keysToDelete: string[] = [];
    
    for (const [key, result] of this.results.entries()) {
      if (this.isExpired(result)) {
        keysToDelete.push(key);
        this.stats.totalSize -= result.size;
        this.stats.expirations++;
      }
    }

    for (const key of keysToDelete) {
      this.results.delete(key);
    }

    this.stats.itemCount = this.results.size;
    this.lastCleanup = Date.now();
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    return { ...this.stats };
  }

  /**
   * Generate a cache key from parameters
   */
  generateKey(parameters: Record<string, unknown>): string {
    // Sort the parameters to ensure consistent key generation
    const sortedParams = this.sortObject(parameters);
    const paramString = JSON.stringify(sortedParams);
    return crypto.createHash('sha256').update(paramString).digest('hex');
  }

  /**
   * Check if a cached result has expired
   */
  private isExpired(result: CachedToolResult): boolean {
    const age = Date.now() - result.timestamp;
    return age > result.ttl;
  }

  /**
   * Evict the least recently used entry
   */
  private evictLeastRecentlyUsed(): void {
    const firstEntry = this.results.entries().next().value;
    if (firstEntry) {
      const [key, result] = firstEntry;
      this.results.delete(key);
      this.stats.totalSize -= result.size;
      this.stats.evictions++;
    }
  }

  /**
   * Update hit ratio statistic
   */
  private updateHitRatio(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRatio = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Sort object properties for consistent key generation
   */
  private sortObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObject(item));
    }

    const sorted: any = {};
    const keys = Object.keys(obj).sort();
    
    for (const key of keys) {
      sorted[key] = this.sortObject(obj[key]);
    }

    return sorted;
  }

  /**
   * Schedule automatic cleanup
   */
  private scheduleCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      await this.cleanup();
    }, this.cleanupInterval);
  }

  /**
   * Stop automatic cleanup
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}