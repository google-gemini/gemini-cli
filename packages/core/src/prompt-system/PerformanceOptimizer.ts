/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  PromptModule,
  TaskContext,
  AssemblyResult,
} from './interfaces/prompt-assembly.js';

/**
 * Performance optimization utilities for the prompt assembly system
 */
export class PerformanceOptimizer {
  private assemblyCache = new Map<string, AssemblyResult>();
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache
  private readonly MAX_CACHE_SIZE = 100;

  /**
   * Create a cache key from task context
   */
  private createCacheKey(context: TaskContext, userMemory?: string): string {
    const contextHash = JSON.stringify({
      taskType: context.taskType,
      hasGitRepo: context.hasGitRepo,
      sandboxMode: context.sandboxMode,
      sandboxType: context.sandboxType,
      hasUserMemory: context.hasUserMemory,
      contextFlags: context.contextFlags,
      tokenBudget: context.tokenBudget,
    });

    const memoryHash = userMemory
      ? `:${userMemory.length}:${userMemory.slice(0, 50)}`
      : '';
    return `${contextHash}${memoryHash}`;
  }

  /**
   * Get cached assembly result if available and valid
   */
  getCachedResult(
    context: TaskContext,
    userMemory?: string,
  ): AssemblyResult | null {
    const key = this.createCacheKey(context, userMemory);
    const cached = this.assemblyCache.get(key);

    if (!cached) {
      return null;
    }

    // Check if cache entry is still valid
    const ageMs = Date.now() - cached.metadata.assemblyTime.getTime();
    if (ageMs > this.CACHE_TTL_MS) {
      this.assemblyCache.delete(key);
      return null;
    }

    return cached;
  }

  /**
   * Cache an assembly result
   */
  cacheResult(
    context: TaskContext,
    result: AssemblyResult,
    userMemory?: string,
  ): void {
    const key = this.createCacheKey(context, userMemory);

    // Implement LRU eviction if cache is full
    if (this.assemblyCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.assemblyCache.keys().next().value;
      this.assemblyCache.delete(firstKey);
    }

    this.assemblyCache.set(key, result);
  }

  /**
   * Optimize module selection for performance
   */
  optimizeModuleSelection(
    modules: PromptModule[],
    _context: TaskContext,
  ): PromptModule[] {
    // Sort modules by loading priority (cached modules first)
    return modules.sort((a, b) => {
      // Prioritize core modules
      if (a.category === 'core' && b.category !== 'core') return -1;
      if (b.category === 'core' && a.category !== 'core') return 1;

      // Then by explicit priority
      if (a.priority !== undefined && b.priority !== undefined) {
        return a.priority - b.priority;
      }

      // Finally by token count (smaller modules first for faster loading)
      return a.tokenCount - b.tokenCount;
    });
  }

  /**
   * Pre-warm cache with common contexts
   */
  async preWarmCache(
    assemblyFunction: (context: TaskContext) => Promise<AssemblyResult>,
  ): Promise<void> {
    const commonContexts: Array<Partial<TaskContext>> = [
      { taskType: 'general', hasGitRepo: false, sandboxMode: false },
      { taskType: 'general', hasGitRepo: true, sandboxMode: false },
      { taskType: 'debug', hasGitRepo: false, sandboxMode: false },
      { taskType: 'debug', hasGitRepo: true, sandboxMode: false },
      {
        taskType: 'software-engineering',
        hasGitRepo: true,
        sandboxMode: false,
      },
    ];

    const promises = commonContexts.map(async (partialContext) => {
      try {
        const fullContext: TaskContext = {
          taskType: 'general',
          hasGitRepo: false,
          sandboxMode: false,
          hasUserMemory: false,
          contextFlags: {},
          tokenBudget: 1500,
          environmentContext: {},
          ...partialContext,
        };

        const result = await assemblyFunction(fullContext);
        this.cacheResult(fullContext, result);
      } catch (_error) {
        // Ignore errors during pre-warming
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Estimate memory usage of cached results
   */
  getMemoryUsage(): {
    cacheSize: number;
    estimatedMemoryKB: number;
    hitRate: number;
  } {
    let totalSize = 0;
    const totalHits = 0;
    const totalRequests = 0;

    for (const result of this.assemblyCache.values()) {
      totalSize += result.prompt.length;
      totalSize += result.includedModules.reduce(
        (sum, mod) => sum + mod.content.length,
        0,
      );
    }

    return {
      cacheSize: this.assemblyCache.size,
      estimatedMemoryKB: Math.ceil(totalSize / 1024),
      hitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
    };
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredEntries(): number {
    const now = Date.now();
    let cleared = 0;

    for (const [key, result] of this.assemblyCache.entries()) {
      const ageMs = now - result.metadata.assemblyTime.getTime();
      if (ageMs > this.CACHE_TTL_MS) {
        this.assemblyCache.delete(key);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Clear all cached results
   */
  clearCache(): void {
    this.assemblyCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    ttlMs: number;
    memoryUsage: ReturnType<typeof this.getMemoryUsage>;
  } {
    return {
      size: this.assemblyCache.size,
      maxSize: this.MAX_CACHE_SIZE,
      ttlMs: this.CACHE_TTL_MS,
      memoryUsage: this.getMemoryUsage(),
    };
  }
}
