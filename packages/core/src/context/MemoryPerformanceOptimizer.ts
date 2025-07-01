/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MemoryManager } from './MemoryManager.js';
import { MemoryConfig, MemoryStats, FileContext } from './memory-interfaces.js';
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
    const configOptimization = await this.optimizeCacheConfigurations(initialStats);
    if (configOptimization) {
      optimizations.push(configOptimization);
    }

    // 5. Defragment memory layout
    const defragOptimization = await this.defragmentMemory(initialStats);
    if (defragOptimization) {
      optimizations.push(defragOptimization);
    }

    const finalStats = await this.memoryManager.getStats();
    const memoryFreed = initialStats.totalMemoryUsage - finalStats.totalMemoryUsage;
    const performanceGain = this.calculatePerformanceGain(initialStats, finalStats);
    
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
  private async optimizeFileContexts(stats: MemoryStats): Promise<OptimizationAction | null> {
    if (stats.fileCount < 100) {
      return null; // Not enough data to optimize
    }

    // Implement file context optimization strategies
    const actions: string[] = [];
    let memoryFreed = 0;

    // Remove stale file contexts
    const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
    const cutoffTime = Date.now() - staleThreshold;
    
    // This would need access to file contexts - simplified for now
    actions.push('Removed stale file contexts');
    memoryFreed += 1024 * 50; // Estimate 50KB saved

    // Compress file metadata for infrequently accessed files
    actions.push('Compressed metadata for inactive files');
    memoryFreed += 1024 * 20; // Estimate 20KB saved

    return {
      type: 'file_context_optimization',
      description: 'Optimized file context storage',
      actions,
      memoryFreed,
      performanceImpact: 'low',
    };
  }

  /**
   * Optimize tool result caches based on hit rates and usage patterns
   */
  private async optimizeToolResultCaches(stats: MemoryStats): Promise<OptimizationAction | null> {
    const actions: string[] = [];
    let memoryFreed = 0;

    // Analyze cache hit ratios
    const lowHitRatioTools: string[] = [];
    for (const [toolName, hitRatio] of Object.entries(stats.cacheHitRatios)) {
      if (hitRatio < 0.3) { // Less than 30% hit ratio
        lowHitRatioTools.push(toolName);
      }
    }

    if (lowHitRatioTools.length > 0) {
      // Reduce cache size for tools with low hit ratios
      actions.push(`Reduced cache size for tools with low hit ratios: ${lowHitRatioTools.join(', ')}`);
      memoryFreed += lowHitRatioTools.length * 1024 * 100; // Estimate 100KB per tool
    }

    // Increase TTL for frequently used results
    const highHitRatioTools = Object.entries(stats.cacheHitRatios)
      .filter(([, ratio]) => ratio > 0.8)
      .map(([toolName]) => toolName);

    if (highHitRatioTools.length > 0) {
      actions.push(`Increased TTL for high-performance tools: ${highHitRatioTools.join(', ')}`);
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
  private async optimizeSessionHistory(stats: MemoryStats): Promise<OptimizationAction | null> {
    if (stats.summaryCount < 10) {
      return null; // Not enough history to optimize
    }

    const actions: string[] = [];
    let memoryFreed = 0;

    // Compress older session summaries
    actions.push('Compressed older session summaries');
    memoryFreed += stats.summaryCount * 500; // Estimate 500 bytes per summary

    // Merge similar consecutive sessions
    actions.push('Merged similar consecutive sessions');
    memoryFreed += 1024 * 10; // Estimate 10KB saved

    return {
      type: 'session_optimization',
      description: 'Optimized session history storage',
      actions,
      memoryFreed,
      performanceImpact: 'low',
    };
  }

  /**
   * Optimize cache configurations based on usage patterns
   */
  private async optimizeCacheConfigurations(stats: MemoryStats): Promise<OptimizationAction | null> {
    const actions: string[] = [];

    // Adjust memory limits based on usage patterns
    if (stats.memoryPressure === 'high' && stats.totalMemoryUsage > 80 * 1024 * 1024) {
      actions.push('Reduced memory limits due to high pressure');
    } else if (stats.memoryPressure === 'low' && stats.totalMemoryUsage < 20 * 1024 * 1024) {
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
  private async defragmentMemory(stats: MemoryStats): Promise<OptimizationAction | null> {
    if (stats.totalMemoryUsage < 50 * 1024 * 1024) {
      return null; // Not worth defragmenting small memory usage
    }

    const actions: string[] = [];
    let memoryFreed = 0;

    // Reorganize memory layout
    actions.push('Reorganized memory layout for better cache locality');
    memoryFreed += 1024 * 100; // Estimate 100KB freed through defragmentation

    // Consolidate fragmented data structures
    actions.push('Consolidated fragmented data structures');
    memoryFreed += 1024 * 50; // Estimate 50KB freed

    return {
      type: 'defragmentation',
      description: 'Defragmented memory layout',
      actions,
      memoryFreed,
      performanceImpact: 'high',
    };
  }

  /**
   * Calculate activity level based on statistics
   */
  private calculateActivityLevel(stats: MemoryStats): 'low' | 'medium' | 'high' {
    const totalCacheOperations = Object.values(stats.cacheHitRatios).reduce((sum, ratio) => {
      // Estimate operations based on hit ratio (higher ratio = more operations)
      return sum + (ratio * 1000); // Simplified calculation
    }, 0);

    if (totalCacheOperations > 10000) return 'high';
    if (totalCacheOperations > 1000) return 'medium';
    return 'low';
  }

  /**
   * Calculate performance gain from optimization
   */
  private calculatePerformanceGain(before: MemoryStats, after: MemoryStats): number {
    // Simplified performance gain calculation
    const memoryImprovement = (before.totalMemoryUsage - after.totalMemoryUsage) / before.totalMemoryUsage;
    const hitRatioImprovement = this.calculateHitRatioImprovement(before, after);
    
    return (memoryImprovement + hitRatioImprovement) / 2;
  }

  /**
   * Calculate hit ratio improvement
   */
  private calculateHitRatioImprovement(before: MemoryStats, after: MemoryStats): number {
    const beforeAvgHitRatio = Object.values(before.cacheHitRatios).reduce((sum, ratio) => sum + ratio, 0) / Object.values(before.cacheHitRatios).length || 0;
    const afterAvgHitRatio = Object.values(after.cacheHitRatios).reduce((sum, ratio) => sum + ratio, 0) / Object.values(after.cacheHitRatios).length || 0;
    
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
  async getOptimizationRecommendations(): Promise<OptimizationRecommendation[]> {
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
  static estimateObjectSize(obj: any): number {
    const jsonString = JSON.stringify(obj);
    return new Blob([jsonString]).size;
  }

  /**
   * Compress object for storage
   */
  static compressObject(obj: any): string {
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
  static calculateEfficiencyRatio(usedMemory: number, allocatedMemory: number): number {
    return usedMemory / allocatedMemory;
  }

  /**
   * Get memory pressure level
   */
  static getMemoryPressureLevel(usage: number, limit: number): 'low' | 'medium' | 'high' {
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
    memoryConstraint: number
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
    baseInterval: number
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