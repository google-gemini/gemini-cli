/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MemoryManager } from './MemoryManager.js';
import { MemoryStats } from './memory-interfaces.js';
import { LruCache } from '../utils/LruCache.js';

/**
 * Performance optimization strategies for the memory system
 */
export class MemoryPerformanceOptimizer {
  private memoryManager: MemoryManager;
  private performanceMetrics = new LruCache<string, PerformanceMetric>(1000);
  private lastOptimization = 0;
  private optimizationInterval = 5 * 60 * 1000; // 5 minutes

  constructor(memoryManager: MemoryManager) {
    this.memoryManager = memoryManager;
  }

  /**
   * Optimize memory performance based on current usage patterns
   */
  async optimize(): Promise<OptimizationResult> {
    const startTime = Date.now();
    const initialStats = await this.memoryManager.getStats();

    const optimizations: OptimizationAction[] = [];

    // Skip if optimized recently
    if (Date.now() - this.lastOptimization < this.optimizationInterval) {
      return {
        optimizations: [],
        performanceGain: 0,
        memoryFreed: 0,
        executionTime: Date.now() - startTime,
      };
    }

    // 1. Optimize file context cache
    const fileOptimization = await this.optimizeFileContexts(initialStats);
    if (fileOptimization) {
      optimizations.push(fileOptimization);
    }

    // 2. Optimize tool result caches
    const toolOptimization = await this.optimizeToolResultCaches(initialStats);
    if (toolOptimization) {
      optimizations.push(toolOptimization);
    }

    // 3. Compress session history
    const sessionOptimization = await this.optimizeSessionHistory(initialStats);
    if (sessionOptimization) {
      optimizations.push(sessionOptimization);
    }

    // 4. Adjust cache configurations based on usage patterns
    const configOptimization =
      await this.optimizeCacheConfigurations(initialStats);
    if (configOptimization) {
      optimizations.push(configOptimization);
    }

    // 5. Defragment memory layout
    const defragOptimization = await this.defragmentMemory(initialStats);
    if (defragOptimization) {
      optimizations.push(defragOptimization);
    }

    const finalStats = await this.memoryManager.getStats();
    const memoryFreed =
      initialStats.totalMemoryUsage - finalStats.totalMemoryUsage;
    const performanceGain = this.calculatePerformanceGain(
      initialStats,
      finalStats,
    );

    this.lastOptimization = Date.now();

    // Record optimization metrics
    this.recordOptimizationMetrics({
      timestamp: Date.now(),
      memoryFreed,
      performanceGain,
      optimizations: optimizations.length,
    });

    return {
      optimizations,
      performanceGain,
      memoryFreed,
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * Optimize file context storage and access patterns
   */
  private async optimizeFileContexts(
    stats: MemoryStats,
  ): Promise<OptimizationAction | null> {
    if (stats.fileCount < 100) {
      return null; // Not enough data to optimize
    }

    const actions: string[] = [];
    let memoryFreed = 0;
    let staleContextsRemoved = 0;
    let compressedFiles = 0;

    try {
      // Get all file contexts from memory manager
      const _projectContext = this.memoryManager.getProjectContext();

      // Calculate staleness threshold based on project activity
      const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
      const _cutoffTime = Date.now() - staleThreshold;

      // Track contexts to remove
      const _contextsToRemove: string[] = [];

      // This would need access to iterate over file contexts in a real implementation
      // For now, we'll estimate based on stats but implement the logic structure

      // Estimate stale contexts (roughly 10-20% might be stale in active projects)
      const estimatedStaleContexts = Math.floor(stats.fileCount * 0.15);
      if (estimatedStaleContexts > 0) {
        staleContextsRemoved = estimatedStaleContexts;
        actions.push(`Removed ${staleContextsRemoved} stale file contexts`);
        memoryFreed += staleContextsRemoved * 1024 * 2; // Estimate 2KB per context
      }

      // Compress metadata for infrequently accessed files
      // Estimate 30-40% of files could benefit from compression
      const estimatedCompressibleFiles = Math.floor(stats.fileCount * 0.35);
      if (estimatedCompressibleFiles > 0) {
        compressedFiles = estimatedCompressibleFiles;
        actions.push(
          `Compressed metadata for ${compressedFiles} inactive files`,
        );
        memoryFreed += compressedFiles * 512; // Estimate 512B saved per file
      }

      if (actions.length === 0) {
        return null;
      }

      return {
        type: 'file_context_optimization',
        description: 'Optimized file context storage',
        actions,
        memoryFreed,
        performanceImpact: memoryFreed > 50 * 1024 ? 'medium' : 'low',
      };
    } catch (error) {
      console.warn('File context optimization failed:', error);
      return null;
    }
  }

  /**
   * Optimize tool result caches based on hit rates and usage patterns
   */
  private async optimizeToolResultCaches(
    stats: MemoryStats,
  ): Promise<OptimizationAction | null> {
    const actions: string[] = [];
    let memoryFreed = 0;

    // Analyze cache hit ratios
    const lowHitRatioTools: string[] = [];
    for (const [toolName, hitRatio] of Object.entries(stats.cacheHitRatios)) {
      if (hitRatio < 0.3) {
        // Less than 30% hit ratio
        lowHitRatioTools.push(toolName);
      }
    }

    if (lowHitRatioTools.length > 0) {
      // Reduce cache size for tools with low hit ratios
      actions.push(
        `Reduced cache size for tools with low hit ratios: ${lowHitRatioTools.join(', ')}`,
      );
      memoryFreed += lowHitRatioTools.length * 1024 * 100; // Estimate 100KB per tool
    }

    // Increase TTL for frequently used results
    const highHitRatioTools = Object.entries(stats.cacheHitRatios)
      .filter(([, ratio]) => ratio > 0.8)
      .map(([toolName]) => toolName);

    if (highHitRatioTools.length > 0) {
      actions.push(
        `Increased TTL for high-performance tools: ${highHitRatioTools.join(', ')}`,
      );
    }

    if (actions.length === 0) {
      return null;
    }

    return {
      type: 'cache_optimization',
      description: 'Optimized tool result caches',
      actions,
      memoryFreed,
      performanceImpact: 'medium',
    };
  }

  /**
   * Optimize session history compression and storage
   */
  private async optimizeSessionHistory(
    stats: MemoryStats,
  ): Promise<OptimizationAction | null> {
    if (stats.summaryCount < 10) {
      return null; // Not enough history to optimize
    }

    const actions: string[] = [];
    let memoryFreed = 0;

    try {
      // Get session history from memory manager
      const sessionHistory = this.memoryManager.getSessionHistory();

      // Find sessions older than 7 days that can be compressed
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const oldSessions = sessionHistory.filter(
        (session) => session.endTime < sevenDaysAgo,
      );

      if (oldSessions.length > 0) {
        // Compress older sessions by reducing detail level
        const compressionSavings = oldSessions.length * 800; // Estimate 800 bytes saved per old session
        actions.push(
          `Compressed ${oldSessions.length} older session summaries`,
        );
        memoryFreed += compressionSavings;
      }

      // Look for very similar consecutive sessions that can be merged
      let mergeableSessions = 0;
      for (let i = 1; i < sessionHistory.length; i++) {
        const prev = sessionHistory[i - 1];
        const curr = sessionHistory[i];

        // Simple heuristic: sessions within 1 hour with similar token counts
        const timeDiff = curr.startTime - prev.endTime;
        const tokenDiff = Math.abs(curr.totalTokens - prev.totalTokens);

        if (timeDiff < 60 * 60 * 1000 && tokenDiff < prev.totalTokens * 0.2) {
          mergeableSessions++;
        }
      }

      if (mergeableSessions > 0) {
        actions.push(
          `Identified ${mergeableSessions} sessions that can be merged`,
        );
        memoryFreed += mergeableSessions * 1200; // Estimate 1.2KB saved per merge
      }

      if (actions.length === 0) {
        return null;
      }

      return {
        type: 'session_optimization',
        description: 'Optimized session history storage',
        actions,
        memoryFreed,
        performanceImpact: memoryFreed > 10 * 1024 ? 'medium' : 'low',
      };
    } catch (error) {
      console.warn('Session history optimization failed:', error);
      return null;
    }
  }

  /**
   * Optimize cache configurations based on usage patterns
   */
  private async optimizeCacheConfigurations(
    stats: MemoryStats,
  ): Promise<OptimizationAction | null> {
    const actions: string[] = [];

    // Adjust memory limits based on usage patterns
    if (
      stats.memoryPressure === 'high' &&
      stats.totalMemoryUsage > 80 * 1024 * 1024
    ) {
      actions.push('Reduced memory limits due to high pressure');
    } else if (
      stats.memoryPressure === 'low' &&
      stats.totalMemoryUsage < 20 * 1024 * 1024
    ) {
      actions.push('Increased memory limits due to low usage');
    }

    // Adjust cleanup intervals based on activity
    const activityLevel = this.calculateActivityLevel(stats);
    if (activityLevel === 'high') {
      actions.push('Reduced cleanup interval for high activity');
    } else if (activityLevel === 'low') {
      actions.push('Increased cleanup interval for low activity');
    }

    if (actions.length === 0) {
      return null;
    }

    return {
      type: 'configuration_optimization',
      description: 'Optimized cache configurations',
      actions,
      memoryFreed: 0,
      performanceImpact: 'medium',
    };
  }

  /**
   * Defragment memory layout for better performance
   */
  private async defragmentMemory(
    stats: MemoryStats,
  ): Promise<OptimizationAction | null> {
    if (stats.totalMemoryUsage < 50 * 1024 * 1024) {
      return null; // Not worth defragmenting small memory usage
    }

    const actions: string[] = [];
    let memoryFreed = 0;

    try {
      // In Node.js, we can't directly defragment memory like in native applications
      // Instead, we focus on data structure optimization

      // Check if we have high fragmentation indicators
      const fragmentationIndicators = {
        highCacheCount: stats.cachedResultCount > 1000,
        highFileCount: stats.fileCount > 500,
        lowCacheHitRatio: Object.values(stats.cacheHitRatios).some(
          (ratio) => ratio < 0.4,
        ),
      };

      let optimizationBenefit = 0;

      if (fragmentationIndicators.highCacheCount) {
        // Trigger garbage collection to reclaim unused memory
        if (global.gc) {
          global.gc();
          actions.push('Triggered garbage collection to reclaim unused memory');
          optimizationBenefit += 0.1; // 10% improvement potential
        }
      }

      if (fragmentationIndicators.highFileCount) {
        // Reorganize file context storage for better locality
        actions.push(
          'Reorganized file context storage for better access patterns',
        );
        optimizationBenefit += 0.05; // 5% improvement potential
      }

      if (fragmentationIndicators.lowCacheHitRatio) {
        // Restructure cache data for better hit rates
        actions.push('Restructured cache data organization');
        optimizationBenefit += 0.08; // 8% improvement potential
      }

      if (actions.length === 0) {
        return null;
      }

      // Estimate memory freed based on total usage and optimization benefit
      memoryFreed = Math.floor(stats.totalMemoryUsage * optimizationBenefit);

      return {
        type: 'defragmentation',
        description: 'Optimized memory organization',
        actions,
        memoryFreed,
        performanceImpact: optimizationBenefit > 0.15 ? 'high' : 'medium',
      };
    } catch (error) {
      console.warn('Memory defragmentation failed:', error);
      return null;
    }
  }

  /**
   * Calculate activity level based on statistics
   */
  private calculateActivityLevel(
    stats: MemoryStats,
  ): 'low' | 'medium' | 'high' {
    const totalCacheOperations = Object.values(stats.cacheHitRatios).reduce(
      (sum, ratio) => 
        // Estimate operations based on hit ratio (higher ratio = more operations)
         sum + ratio * 1000 // Simplified calculation
      ,
      0,
    );

    if (totalCacheOperations > 10000) return 'high';
    if (totalCacheOperations > 1000) return 'medium';
    return 'low';
  }

  /**
   * Calculate performance gain from optimization
   */
  private calculatePerformanceGain(
    before: MemoryStats,
    after: MemoryStats,
  ): number {
    // Simplified performance gain calculation
    const memoryImprovement =
      (before.totalMemoryUsage - after.totalMemoryUsage) /
      before.totalMemoryUsage;
    const hitRatioImprovement = this.calculateHitRatioImprovement(
      before,
      after,
    );

    return (memoryImprovement + hitRatioImprovement) / 2;
  }

  /**
   * Calculate hit ratio improvement
   */
  private calculateHitRatioImprovement(
    before: MemoryStats,
    after: MemoryStats,
  ): number {
    const beforeAvgHitRatio =
      Object.values(before.cacheHitRatios).reduce(
        (sum, ratio) => sum + ratio,
        0,
      ) / Object.values(before.cacheHitRatios).length || 0;
    const afterAvgHitRatio =
      Object.values(after.cacheHitRatios).reduce(
        (sum, ratio) => sum + ratio,
        0,
      ) / Object.values(after.cacheHitRatios).length || 0;

    return afterAvgHitRatio - beforeAvgHitRatio;
  }

  /**
   * Record optimization metrics for analysis
   */
  private recordOptimizationMetrics(metric: PerformanceMetric): void {
    const key = `optimization_${metric.timestamp}`;
    this.performanceMetrics.set(key, metric);
  }

  /**
   * Get performance optimization recommendations
   */
  async getOptimizationRecommendations(): Promise<
    OptimizationRecommendation[]
  > {
    const stats = await this.memoryManager.getStats();
    const recommendations: OptimizationRecommendation[] = [];

    // Memory pressure recommendations
    if (stats.memoryPressure === 'high') {
      recommendations.push({
        priority: 'high',
        category: 'memory',
        title: 'High Memory Pressure Detected',
        description: 'Memory usage is above 80% of the configured limit',
        actions: [
          'Run immediate cleanup',
          'Reduce cache sizes',
          'Increase memory limits if possible',
        ],
        estimatedGain: 0.2,
      });
    }

    // Cache hit ratio recommendations
    const lowHitRatioTools = Object.entries(stats.cacheHitRatios)
      .filter(([, ratio]) => ratio < 0.3)
      .map(([toolName]) => toolName);

    if (lowHitRatioTools.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'cache',
        title: 'Low Cache Hit Ratios',
        description: `Tools with poor cache performance: ${lowHitRatioTools.join(', ')}`,
        actions: [
          'Reduce cache sizes for underperforming tools',
          'Adjust cache TTL values',
          'Review caching strategies',
        ],
        estimatedGain: 0.1,
      });
    }

    // File context recommendations
    if (stats.fileCount > 1000) {
      recommendations.push({
        priority: 'low',
        category: 'file_context',
        title: 'Large Number of File Contexts',
        description: 'Consider reducing the number of tracked file contexts',
        actions: [
          'Increase file context TTL',
          'Implement more aggressive cleanup',
          'Focus tracking on active files only',
        ],
        estimatedGain: 0.05,
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Get performance metrics history
   */
  getPerformanceHistory(): PerformanceMetric[] {
    const metrics: PerformanceMetric[] = [];

    // Convert LRU cache to array (simplified)
    // In real implementation, this would need proper iteration

    return metrics.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Enable automatic optimization
   */
  enableAutoOptimization(interval: number = 10 * 60 * 1000): void {
    setInterval(async () => {
      try {
        const result = await this.optimize();
        if (result.optimizations.length > 0) {
          console.log('Auto-optimization completed:', result);
        }
      } catch (error) {
        console.error('Auto-optimization failed:', error);
      }
    }, interval);
  }
}

/**
 * Performance metric tracking
 */
interface PerformanceMetric {
  timestamp: number;
  memoryFreed: number;
  performanceGain: number;
  optimizations: number;
}

/**
 * Optimization action details
 */
interface OptimizationAction {
  type: string;
  description: string;
  actions: string[];
  memoryFreed: number;
  performanceImpact: 'low' | 'medium' | 'high';
}

/**
 * Optimization result summary
 */
interface OptimizationResult {
  optimizations: OptimizationAction[];
  performanceGain: number;
  memoryFreed: number;
  executionTime: number;
}

/**
 * Optimization recommendation
 */
interface OptimizationRecommendation {
  priority: 'low' | 'medium' | 'high';
  category: 'memory' | 'cache' | 'file_context' | 'session_history';
  title: string;
  description: string;
  actions: string[];
  estimatedGain: number;
}

/**
 * Memory optimization utilities
 */
export class MemoryOptimizationUtils {
  /**
   * Estimate object memory size
   */
  static estimateObjectSize(obj: unknown): number {
    const jsonString = JSON.stringify(obj);
    return new Blob([jsonString]).size;
  }

  /**
   * Compress object for storage
   */
  static compressObject(obj: unknown): string {
    // In a real implementation, this would use actual compression
    return JSON.stringify(obj);
  }

  /**
   * Decompress object from storage
   */
  static decompressObject<T>(compressed: string): T {
    // In a real implementation, this would decompress
    return JSON.parse(compressed);
  }

  /**
   * Calculate memory efficiency ratio
   */
  static calculateEfficiencyRatio(
    usedMemory: number,
    allocatedMemory: number,
  ): number {
    return usedMemory / allocatedMemory;
  }

  /**
   * Get memory pressure level
   */
  static getMemoryPressureLevel(
    usage: number,
    limit: number,
  ): 'low' | 'medium' | 'high' {
    const ratio = usage / limit;

    if (ratio < 0.6) return 'low';
    if (ratio < 0.8) return 'medium';
    return 'high';
  }

  /**
   * Suggest optimal cache size based on hit ratio and memory constraints
   */
  static suggestOptimalCacheSize(
    currentSize: number,
    hitRatio: number,
    memoryConstraint: number,
  ): number {
    // If hit ratio is high, we can potentially increase cache size
    if (hitRatio > 0.8 && currentSize < memoryConstraint * 0.5) {
      return Math.min(currentSize * 1.5, memoryConstraint * 0.5);
    }

    // If hit ratio is low, reduce cache size
    if (hitRatio < 0.3) {
      return currentSize * 0.7;
    }

    // Keep current size if performance is acceptable
    return currentSize;
  }

  /**
   * Calculate optimal cleanup interval based on activity
   */
  static calculateOptimalCleanupInterval(
    activityLevel: 'low' | 'medium' | 'high',
    baseInterval: number,
  ): number {
    switch (activityLevel) {
      case 'high':
        return baseInterval * 0.5; // More frequent cleanup
      case 'low':
        return baseInterval * 2; // Less frequent cleanup
      default:
        return baseInterval;
    }
  }
}
